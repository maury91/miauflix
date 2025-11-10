import { authApi } from '@features/auth/api/auth.api';
import type { UserDto } from '@miauflix/backend-client';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

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

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession: (state, action: PayloadAction<string>) => {
      state.currentSessionId = action.payload;
    },
    setSessions: (state, action: PayloadAction<SessionInfo[]>) => {
      state.availableSessions = action.payload;
    },
    setCurrentUser: (state, action: PayloadAction<UserDto>) => {
      state.currentUser = action.payload;
    },
    clearAuth: state => {
      state.currentSessionId = null;
      state.availableSessions = [];
      state.currentUser = null;
    },
  },
  extraReducers: builder => {
    // Login successful - set session and user
    builder.addMatcher(authApi.endpoints.login.matchFulfilled, (state, action) => {
      const { session, user } = action.payload;
      state.currentSessionId = session;
      state.currentUser = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      };
    });

    // Refresh successful - update user info
    builder.addMatcher(authApi.endpoints.refresh.matchFulfilled, (state, action) => {
      state.currentUser = action.payload.user;
    });

    // Logout - clear auth (on both success and failure)
    builder.addMatcher(authApi.endpoints.logout.matchFulfilled, state => {
      state.currentSessionId = null;
      state.availableSessions = [];
      state.currentUser = null;
    });
    builder.addMatcher(authApi.endpoints.logout.matchRejected, state => {
      // Clear on error too
      state.currentSessionId = null;
      state.availableSessions = [];
      state.currentUser = null;
    });

    // List sessions successful - update available sessions and auto-select if only one
    builder.addMatcher(authApi.endpoints.listSessions.matchFulfilled, (state, action) => {
      const sessions = action.payload;
      state.availableSessions = sessions;

      if (state.currentSessionId) {
        if (!sessions.some(session => session.session === state.currentSessionId)) {
          state.currentSessionId = null;
          state.currentUser = null;
        }
      }

      // Auto-select if only one session and no session is currently selected
      if (sessions.length === 1 && !state.currentSessionId) {
        const session = sessions[0];
        state.currentSessionId = session.session;
        state.currentUser = session.user;
      }
      // If multiple sessions or no sessions, state remains as is (user will select or login)
    });

    // Device login successful - set session and user
    builder.addMatcher(authApi.endpoints.checkDeviceLoginStatus.matchFulfilled, (state, action) => {
      if (action.payload.success === true) {
        state.currentSessionId = action.payload.session;
        state.currentUser = action.payload.user;
      }
    });
  },
});

export const { setSession, setSessions, setCurrentUser, clearAuth } = authSlice.actions;

// Selectors
export const selectCurrentSessionId = (state: { auth: AuthState }) => state.auth.currentSessionId;
export const selectAvailableSessions = (state: { auth: AuthState }) => state.auth.availableSessions;
export const selectCurrentUser = (state: { auth: AuthState }) => state.auth.currentUser;
export const selectIsAuthenticated = (state: { auth: AuthState }) =>
  state.auth.currentSessionId !== null && state.auth.currentUser !== null;
