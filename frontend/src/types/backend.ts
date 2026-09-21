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
  StreamingKeyResponse,
  TVShowDto,
  UserDto,
} from '@miauflix/backend';

import type { ListDto } from '@miauflix/backend';
export type CategoryDto = ListDto;
