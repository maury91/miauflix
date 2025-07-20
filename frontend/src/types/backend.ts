// Re-export backend client types for convenience
export type {
  MediaDto,
  MovieDto,
  TVShowDto,
  ListDto,
  MovieResponse,
  ShowResponse,
  ListResponse,
  Quality,
  Source,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  LogoutResponse,
  CreateUserResponse,
  StreamingKeyResponse,
  SeasonResponse,
  ProgressRequest,
  ProgressResponse,
  DeviceAuthResponse,
  DeviceAuthCheckRequest,
  DeviceAuthCheckPending,
  DeviceAuthCheckResponse,
  DeviceAuthCheckSuccess,
  DeviceAuthCheckError,
  TraktAssociationResponse,
  TraktAdminAssociateRequest,
  TraktAdminAssociateResponse,
  UserDto,
} from '@miauflix/backend-client';

// Legacy type aliases for backward compatibility
import type { ListDto, DeviceAuthResponse } from '@miauflix/backend-client';
export type CategoryDto = ListDto;
export type DeviceLoginDto = DeviceAuthResponse;
