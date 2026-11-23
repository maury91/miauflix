// Re-export backend client types for convenience
export type {
  CreateUserResponse,
  ListDto,
  ListResponse,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  MediaDto,
  MovieDto,
  MovieResponse,
  ProgressRequest,
  ProgressResponse,
  QrLoginClaimPending,
  QrLoginResponse,
  Quality,
  RefreshResponse,
  SeasonResponse,
  ShowResponse,
  Source,
  TVShowDto,
  UserDto,
} from '@miauwatch/backend';

import type { ListDto } from '@miauwatch/backend';
export type CategoryDto = ListDto;
