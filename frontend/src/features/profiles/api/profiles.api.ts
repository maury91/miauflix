import { authApi } from '@features/auth/api/auth.api';
import type { AvatarLook, LoginResponse, UserDto, UserRole } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import {
  type ApiRequestResult,
  authenticatedRequest,
  refreshSession,
  request,
} from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { API_CREDENTIALS } from '@shared/config/constants';
import { addSession, profileUpdated, type SessionInfo, sessionRemoved } from '@store/slices/auth';

export interface CreateProfileRequest {
  /** An admin session on this device; it creates the account. */
  adminSession: string;
  email: string;
  password: string;
  displayName: string;
  avatar: AvatarLook;
  /** The pre-rendered avatar, for devices that cannot draw Plushies live. */
  image?: Blob | null;
}

export interface UpdateProfileRequest {
  /** The profile's own session: each profile edits itself. */
  session: string;
  displayName: string;
  avatar: AvatarLook;
  image?: Blob | null;
}

type Dispatch = (action: unknown) => unknown;

const sessionHeaders = (session: string) => ({ 'X-Session-Id': session });

/** A refused session leaves the device alone: the other profiles, and who is watching, stay. */
function onInvalidSession(dispatch: Dispatch, session: string) {
  return () => {
    dispatch(sessionRemoved(session));
    dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
  };
}

/** Upload the pre-rendered avatar of the session's profile. */
function uploadAvatarImage(
  session: string,
  image: Blob,
  dispatch: Dispatch
): Promise<ApiRequestResult<UserDto>> {
  return authenticatedRequest<UserDto>({
    requestFn: () =>
      backendClient.api.auth.session.avatar.$put(
        {},
        {
          headers: { ...sessionHeaders(session), 'Content-Type': 'image/png' },
          init: { body: image, credentials: API_CREDENTIALS },
        }
      ),
    session,
    errorContext: 'Failed to save the profile picture',
    onInvalidSession: onInvalidSession(dispatch, session),
  });
}

export const profilesApi = createApi({
  reducerPath: 'profilesApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    /**
     * Create an account for a new profile and sign it in on this device, without switching to
     * it: the selector then shows it next to the others.
     */
    createProfile: builder.mutation<SessionInfo, CreateProfileRequest>({
      async queryFn({ adminSession, email, password, displayName, avatar, image }, { dispatch }) {
        const created = await authenticatedRequest<UserDto>({
          requestFn: () =>
            backendClient.api.auth.users.$post(
              { json: { email, password, role: 'user' as UserRole, displayName, avatar } },
              { headers: sessionHeaders(adminSession) }
            ),
          session: adminSession,
          errorContext: 'Failed to create the profile',
          onInvalidSession: onInvalidSession(dispatch, adminSession),
        });
        // Taken: maybe by this very profile, created on an earlier try whose sign-in failed.
        // With its password it can still be signed in, instead of being stuck as "taken".
        const taken = 'error' in created && created.error.status === 409;
        if ('error' in created && !taken) return created;

        const signedIn = await request<LoginResponse>(
          () => backendClient.api.auth.login.$post({ json: { email, password } }),
          'The profile was created, but signing it in failed: try again'
        );
        if ('error' in signedIn) return taken ? created : signedIn;

        let profile: SessionInfo = { session: signedIn.data.session, user: signedIn.data.user };
        if (image) {
          const uploaded = await uploadAvatarImage(profile.session, image, dispatch);
          // The profile exists and is signed in; without the picture it shows its colour.
          if ('data' in uploaded) profile = { ...profile, user: uploaded.data };
        }
        dispatch(addSession(profile));
        return { data: profile };
      },
    }),

    updateProfile: builder.mutation<UserDto, UpdateProfileRequest>({
      async queryFn({ session, displayName, avatar, image }, { dispatch }) {
        const updated = await authenticatedRequest<UserDto>({
          requestFn: () =>
            backendClient.api.auth.session.profile.$patch(
              { json: { displayName, avatar } },
              { headers: sessionHeaders(session) }
            ),
          session,
          errorContext: 'Failed to save the profile',
          onInvalidSession: onInvalidSession(dispatch, session),
        });
        if ('error' in updated) return updated;

        let user = updated.data;
        if (image) {
          const uploaded = await uploadAvatarImage(session, image, dispatch);
          if ('data' in uploaded) user = uploaded.data;
        }
        dispatch(profileUpdated(user));
        return { data: user };
      },
    }),

    /** Save the pre-rendered picture of a profile's current look, keeping the look itself. */
    uploadProfilePicture: builder.mutation<UserDto, { session: string; image: Blob }>({
      async queryFn({ session, image }, { dispatch }) {
        const uploaded = await uploadAvatarImage(session, image, dispatch);
        if ('error' in uploaded) return uploaded;
        dispatch(profileUpdated(uploaded.data));
        return { data: uploaded.data };
      },
    }),
  }),
});

export const { useCreateProfileMutation, useUpdateProfileMutation } = profilesApi;

const avatarImages = new Map<string, Promise<string | null>>();

/**
 * An object URL for a profile's pre-rendered avatar, cached per image version. Fetched with a
 * session header because session cookies are only sent with one (and the TV has none).
 */
export function loadAvatarImage(
  session: string,
  userId: string,
  version: number
): Promise<string | null> {
  const key = `${userId}:${version}`;
  const cached = avatarImages.get(key);
  if (cached) return cached;

  const loading = (async () => {
    try {
      const fetchImage = () =>
        backendClient.api.auth.avatars[':userId'].$get(
          // The version in the URL: the response is cached for good, so each picture needs its own
          { param: { userId }, query: { v: String(version) } },
          { headers: sessionHeaders(session) }
        );
      let response = await fetchImage();
      if ((response.status as number) === 401) {
        if ('data' in (await refreshSession(session))) response = await fetchImage();
      }
      if (!response.ok) return null;
      return URL.createObjectURL(await response.blob());
    } catch {
      return null;
    }
  })();
  avatarImages.set(key, loading);
  void loading.then(url => {
    if (!url) avatarImages.delete(key);
  });
  return loading;
}
