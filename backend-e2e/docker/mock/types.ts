export interface HandleRequestParams {
  req: Request;
  path: string;
  queryParams: Record<string, string>;
  method: string;
  filePath: string;
  API_KEY: string;
  API_SECRET: string;
  API_BASE_URL: string | undefined;
  API_HEADERS: Record<string, string>;
  API_AUTH_HEADER: string;
  API_AUTH_HEADER_IS_BEARER: boolean;
}

export interface HandleRequestResponse {
  data: any;
  store: boolean;
  response: Response;
}
