// Re-export backend client types for convenience
export type {
  CreateUserResponse,
  DeviceAuthCheckError,
  DeviceAuthCheckPending,
  DeviceAuthCheckRequest,
  DeviceAuthCheckResponse,
  DeviceAuthCheckSuccess,
  DeviceAuthResponse,
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
  Quality,
  RefreshResponse,
  SeasonResponse,
  ShowResponse,
  Source,
  StreamingKeyResponse,
  TraktAdminAssociateRequest,
  TraktAdminAssociateResponse,
  TraktAssociationResponse,
  TVShowDto,
  UserDto,
} from '@miauflix/backend-client';

// Legacy type aliases for backward compatibility
import type { DeviceAuthResponse, ListDto } from '@miauflix/backend-client';
export type CategoryDto = ListDto;
export type DeviceLoginDto = DeviceAuthResponse;
