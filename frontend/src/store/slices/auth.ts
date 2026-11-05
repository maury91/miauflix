import { authApi } from '@features/auth/api/auth.api';
import type { UserDto } from '@miauflix/backend';
import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface SessionInfo {
  session: string;
  user: UserDto;
}
interface AuthState {
  currentSessionId: string | null;
  availableSessions: SessionInfo[];
  currentUser: UserDto | null;
}

const initialState: AuthState = {
  currentSessionId: null,
  availableSessions: [],
  currentUser: null,
};

/**
 * The profile chosen in this app run. sessionStorage survives reloads, returning from the
 * player and resuming the TV app, while a fresh start (new tab, app launch) asks again.
 */
export const CURRENT_SESSION_STORAGE_KEY = 'miauflix.currentSession';

export function readStoredSessionId(): string | null {
  try {
    return typeof window === 'undefined'
      ? null
      : window.sessionStorage.getItem(CURRENT_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredSessionId(session: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (session) window.sessionStorage.setItem(CURRENT_SESSION_STORAGE_KEY, session);
    else window.sessionStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the profile then lasts for this page only.
  }
}

/** Add a session, or replace the one with the same id. */
function upsertSession(state: AuthState, entry: SessionInfo): void {
  const index = state.availableSessions.findIndex(({ session }) => session === entry.session);
  if (index === -1) state.availableSessions.push(entry);
  else state.availableSessions[index] = entry;
}

/** Keep every copy of a user (in each of its sessions) up to date. */
function updateUser(state: AuthState, user: UserDto): void {
  state.availableSessions.forEach(entry => {
    if (entry.user.id === user.id) entry.user = user;
  });
  if (state.currentUser?.id === user.id) state.currentUser = user;
}

function removeSession(state: AuthState, session: string): void {
  state.availableSessions = state.availableSessions.filter(entry => entry.session !== session);
  if (state.currentSessionId === session) {
    state.currentSessionId = null;
    state.currentUser = null;
  }
}

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession: (state, action: PayloadAction<string>) => {
      state.currentSessionId = action.payload;
      const entry = state.availableSessions.find(({ session }) => session === action.payload);
      if (entry) state.currentUser = entry.user;
    },
    setSessions: (state, action: PayloadAction<SessionInfo[]>) => {
      state.availableSessions = action.payload;
    },
    setCurrentUser: (state, action: PayloadAction<UserDto>) => {
      state.currentUser = action.payload;
      if (state.currentSessionId)
        upsertSession(state, { session: state.currentSessionId, user: action.payload });
    },
    /** A session was added on this device (a new profile) without switching to it. */
    addSession: (state, action: PayloadAction<SessionInfo>) => {
      upsertSession(state, action.payload);
    },
    /** A profile's name or look changed. */
    profileUpdated: (state, action: PayloadAction<UserDto>) => {
      updateUser(state, action.payload);
    },
    /** A session stopped being valid (its refresh was refused): only that profile leaves. */
    sessionRemoved: (state, action: PayloadAction<string>) => {
      removeSession(state, action.payload);
    },
    clearAuth: state => {
      state.currentSessionId = null;
      state.availableSessions = [];
      state.currentUser = null;
    },
  },
  extraReducers: builder => {
    // Signing in adds a profile to the device; Who's watching then picks who is watching.
    builder.addMatcher(authApi.endpoints.login.matchFulfilled, (state, action) => {
      const { session, user } = action.payload;
      upsertSession(state, { session, user });
    });

    // Refresh successful - update user info
    builder.addMatcher(authApi.endpoints.refresh.matchFulfilled, (state, action) => {
      updateUser(state, action.payload.user);
    });

    // Logging out removes only that profile from the device (on failure too: the server
    // has already cleared the session cookies, or the session was invalid), except when the
    // request was turned away (429) and the session is still valid.
    builder.addMatcher(authApi.endpoints.logout.matchFulfilled, (state, action) => {
      removeSession(state, action.meta.arg.originalArgs.session);
    });
    builder.addMatcher(authApi.endpoints.logout.matchRejected, (state, action) => {
      if ((action.payload as { status?: unknown } | undefined)?.status === 429) return;
      removeSession(state, action.meta.arg.originalArgs.session);
    });

    // The device's sessions are its profiles. The chosen one is kept while it is still listed,
    // and restored from this app run after a reload; otherwise Who's watching asks.
    builder.addMatcher(authApi.endpoints.listSessions.matchFulfilled, (state, action) => {
      const sessions = action.payload;
      state.availableSessions = sessions;

      const wanted = state.currentSessionId ?? readStoredSessionId();
      const chosen = wanted ? sessions.find(({ session }) => session === wanted) : undefined;
      state.currentSessionId = chosen?.session ?? null;
      state.currentUser = chosen?.user ?? null;
    });

    // QR login adds a profile, like signing in with a password.
    builder.addMatcher(authApi.endpoints.claimQrLogin.matchFulfilled, (state, action) => {
      if ('session' in action.payload) {
        upsertSession(state, { session: action.payload.session, user: action.payload.user });
      }
    });
  },
});

export const {
  setSession,
  setSessions,
  setCurrentUser,
  addSession,
  profileUpdated,
  sessionRemoved,
  clearAuth,
} = authSlice.actions;

interface AuthRoot {
  auth: AuthState;
}

// Selectors
export const selectCurrentSessionId = (state: AuthRoot) => state.auth.currentSessionId;
export const selectAvailableSessions = (state: AuthRoot) => state.auth.availableSessions;
export const selectCurrentUser = (state: AuthRoot) => state.auth.currentUser;
export const selectIsAuthenticated = (state: AuthRoot) =>
  state.auth.currentSessionId !== null && state.auth.currentUser !== null;

export const selectIsAdmin = (state: AuthRoot) => state.auth.currentUser?.role === 'admin';

/** The device holds at least one signed-in profile. */
export const selectHasSessions = (state: AuthRoot) => state.auth.availableSessions.length > 0;

/** One entry per account signed in on this device (an account can hold several sessions). */
export const selectProfiles = createSelector(
  [selectAvailableSessions, selectCurrentSessionId],
  (sessions, currentSessionId): SessionInfo[] => {
    const byUser = new Map<string, SessionInfo>();
    sessions.forEach(entry => {
      // Prefer the session in use, so editing a profile acts through it.
      if (!byUser.has(entry.user.id) || entry.session === currentSessionId)
        byUser.set(entry.user.id, entry);
    });
    return [...byUser.values()];
  }
);

/** A signed-in admin profile on this device; it can add profiles even while another watches. */
export const selectAdminSession = (state: AuthRoot): SessionInfo | null =>
  (state.auth.currentUser?.role === 'admin'
    ? state.auth.availableSessions.find(({ session }) => session === state.auth.currentSessionId)
    : undefined) ??
  state.auth.availableSessions.find(({ user }) => user.role === 'admin') ??
  null;
