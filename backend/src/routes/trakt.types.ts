export interface DeviceAuthResponse {
  success: boolean;
  codeUrl: string;
  userCode: string;
  deviceCode: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceAuthCheckRequest {
  deviceCode: string;
}

export type {
  DeviceAuthCheckPending,
  DeviceAuthCheckResponse,
  DeviceAuthCheckSuccess,
} from '@services/trakt/trakt.types';

export interface TraktAssociationResponse {
  associated: boolean;
  traktUsername: string | null;
  traktSlug: string | null;
}

export interface TraktAdminAssociateRequest {
  traktSlug: string;
  userEmail: string;
}

export interface TraktAdminAssociateResponse {
  success: true;
  association: {
    id: string;
    traktSlug: string;
    userEmail: string | null;
  };
}
