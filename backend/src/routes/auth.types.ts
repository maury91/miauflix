import type { AuthTokens } from '@services/auth/auth.types';

export type { AuthTokens };

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  session: string;
  user: UserDto;
  /** Only for clients that asked for token transport (`X-Auth-Transport: token`). */
  tokens?: AuthTokens;
}

export interface QrLoginResponse {
  requestId: string;
  claimToken: string;
  approvalPath: string;
  expiresAt: string;
  pollInterval: number;
}

export interface QrLoginClaimPending {
  state: 'pending';
}

export interface QrLoginClaimResponse extends LoginResponse {
  state?: 'claimed';
}

export interface RefreshResponse {
  user: UserDto;
  /** Only for clients that asked for token transport (`X-Auth-Transport: token`). */
  tokens?: AuthTokens;
}

export interface LogoutResponse {
  message: string;
}

import type { UserRole } from '@entities/user.entity';
export type { UserRole };
export interface CreateUserRequest {
  email: string;
  password: string;
  role: UserRole;
}

export interface UserDto {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
}

export type CreateUserResponse = UserDto;

export interface SessionResponse {
  id: string;
  user: UserDto;
}
