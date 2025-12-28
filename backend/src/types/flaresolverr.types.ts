/**
 * FlareSolverr API TypeScript definitions
 * Based on: https://github.com/FlareSolverr/FlareSolverr#-requestget
 */

/**
 * FlareSolverr cookie object as returned in the solution
 * @see https://github.com/FlareSolverr/FlareSolverr#-requestget
 */
export interface FlareSolverrCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  size?: number;
  httpOnly?: boolean;
  secure?: boolean;
  session?: boolean;
  sameSite?: 'Lax' | 'None' | 'Strict';
}

/**
 * FlareSolverr solution object containing the resolved request data
 * @see https://github.com/FlareSolverr/FlareSolverr#-requestget
 */
export interface FlareSolverrSolution {
  url: string;
  status: number;
  headers: Record<string, string>;
  response: string;
  cookies: FlareSolverrCookie[];
  userAgent?: string;
  turnstile_token?: string;
}

/**
 * FlareSolverr API response structure
 * @see https://github.com/FlareSolverr/FlareSolverr#-requestget
 */
export interface FlareSolverrResponse {
  status: string | 'ok';
  message?: string;
  solution?: FlareSolverrSolution;
  startTimestamp?: number;
  endTimestamp?: number;
  version?: string;
}

/**
 * FlareSolverr proxy configuration
 * @see https://github.com/FlareSolverr/FlareSolverr#-requestget
 */
export interface FlareSolverrProxy {
  url: string;
  username?: string;
  password?: string;
}

/**
 * Cookie pair for FlareSolverr request cookies parameter
 * @see https://github.com/FlareSolverr/FlareSolverr#-requestget
 */
export interface CookiePair {
  name: string;
  value: string;
}

/**
 * FlareSolverr request.get payload
 * @see https://github.com/FlareSolverr/FlareSolverr#-requestget
 */
export interface FlareSolverrGetRequest {
  cmd: 'request.get';
  url: string;
  session?: string;
  session_ttl_minutes?: number;
  maxTimeout?: number; // Default 60_000ms
  cookies?: CookiePair[];
  returnOnlyCookies?: boolean; // Default false
  returnScreenshot?: boolean; // Default false
  proxy?: FlareSolverrProxy;
  waitInSeconds?: number; // Default none
  disableMedia?: boolean; // Default false
  tabs_till_verify?: number; // Default none
}

/**
 * FlareSolverr request.post payload
 * @see https://github.com/FlareSolverr/FlareSolverr#-requestpost
 */
export interface FlareSolverrPostRequest extends Omit<FlareSolverrGetRequest, 'cmd'> {
  cmd: 'request.post';
  postData: string;
}

/**
 * Union type for FlareSolverr request payloads
 */
export type FlareSolverrRequest = FlareSolverrGetRequest | FlareSolverrPostRequest;
