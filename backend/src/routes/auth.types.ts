export type { AuthTokens } from '@services/auth/auth.types';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  session: string;
  user: UserDto;
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
