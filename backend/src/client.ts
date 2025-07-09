/// <reference types="./types/webtorrent.d.ts" />

import { hc } from 'hono/client';

import type { RoutesApp } from './routes';

// assign the client to a variable to calculate the type when compiling
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const client = hc<RoutesApp>('');
export type Client = typeof client;

export const hcWithType = (...args: Parameters<typeof hc>): Client => hc<RoutesApp>(...args);

// Re-export route DTOs for consumers
export type {
  AuthTokens,
  CreateUserRequest,
  CreateUserResponse,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  LogoutResponse,
  RefreshRequest,
  RefreshResponse,
  UserDto,
} from './routes/auth.types';
export type { MovieResponse, MovieSourceDto, StreamingKeyResponse } from './routes/movie.types';
export type {
  StreamParams,
  StreamQuery,
  StreamResponse,
  StreamSourceDto,
} from './routes/stream.types';
export type {
  DeviceAuthCheckRequest,
  DeviceAuthCheckResponse,
  DeviceAuthResponse,
  TraktAdminAssociateRequest,
  TraktAdminAssociateResponse,
  TraktAssociationResponse,
} from './routes/trakt.types';
