export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type AnonymizedBy = false | 'faker' | 'llm';

export interface MockResponseEnvelope<T = unknown> {
  headers?: Record<string, string>;
  status: number;
  anonymized: AnonymizedBy;
  data: T;
}

export interface HandleRequestParams {
  req: Request;
  path: string;
  queryParams: Record<string, string>;
  method: HttpMethod;
  filePath: string;
  API_KEY: string;
  API_SECRET: string;
  API_BASE_URL?: string;
  API_HEADERS: Record<string, string>;
  API_AUTH_HEADER: string;
  API_AUTH_HEADER_IS_BEARER: boolean;
  RECORD_PROVIDER_FIXTURES: boolean;
}

export interface HandleRequestResponse<T = unknown> {
  data: T;
  store: boolean;
  response: Response;
}
