export type { AuthTokens } from '@services/auth/auth.types';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  session: string;
  user: UserDto;
}

export interface RefreshResponse {
  accessToken: string;
  user: UserDto;
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
