import type { AuthTokens } from '@services/auth/auth.types';
export type { AuthTokens } from '@services/auth/auth.types';

export interface LoginRequest {
  email: string;
  password: string;
}

export type LoginResponse = AuthTokens;

export interface RefreshRequest {
  refreshToken: string;
}

export type RefreshResponse = AuthTokens;

export interface LogoutRequest {
  refreshToken: string;
}

export interface LogoutResponse {
  message: string;
}

import type { UserRole } from '@entities/user.entity';
export interface CreateUserRequest {
  email: string;
  password: string;
  role: UserRole;
}

export interface UserDto {
  id: string;
  email: string;
  role: UserRole;
}

export type CreateUserResponse = UserDto;
