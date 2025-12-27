import { logger } from '@logger';

import { ENV } from '@constants';
import type {
  CookiePair,
  FlareSolverrGetRequest,
  FlareSolverrPostRequest,
  FlareSolverrRequest,
  FlareSolverrResponse,
} from '@mytypes/flaresolverr.types';
import type { StatsService } from '@services/stats/stats.service';
import { isHtmlWrappedJson, unwrapJsonFromHtml } from '@utils/html-unwrapper.util';
import { bodyInitToString, normalizeHeaders, parseResponseBody } from '@utils/http.util';
import { tryParseJSON } from '@utils/json.util';
import { buildUrlWithQuery, extractDomain } from '@utils/url.util';

import { CookieJar } from './cookie-jar';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
];

const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

export interface RequestOptions<B = false> {
  queryString?: Record<string, boolean | number | string>;
  timeout?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: BodyInit;
  signal?: AbortSignal;
  redirect?: RequestRedirect;
  asBuffer?: B;
}

export interface RequestServiceResponse<T> {
  body: T | string;
  headers: Record<string, string>;
  ok: boolean;
  status: number;
  statusText: string;
}

/**
 * Service for making HTTP requests with cookie management, user agent rotation,
 * and FlareSolverr integration for bypassing Cloudflare protection.
 */
export class RequestService {
  private readonly cookieJar: CookieJar;
  private readonly userAgentByDomain: Map<string, string>;
  private readonly isFlareSolverrEnabled: boolean;
  private readonly flareSolverrUrl: string;

  constructor(private readonly statsService: StatsService) {
    this.cookieJar = new CookieJar();
    this.userAgentByDomain = new Map<string, string>();
    this.isFlareSolverrEnabled = ENV('ENABLE_FLARESOLVERR') === true && !!ENV('FLARESOLVERR_URL');
    this.flareSolverrUrl = ENV('FLARESOLVERR_URL') || '';
  }

  /**
   * Build FlareSolverr GET request payload
   */
  private buildFlareSolverrGetRequest(url: string, cookies: CookiePair[]): FlareSolverrGetRequest {
    const payload: FlareSolverrGetRequest = {
      cmd: 'request.get',
      url,
    };

    if (cookies.length > 0) {
      payload.cookies = cookies;
    }

    return payload;
  }

  /**
   * Build FlareSolverr POST request payload
   */
  private buildFlareSolverrPostRequest(
    url: string,
    postData: string,
    cookies: CookiePair[]
  ): FlareSolverrPostRequest {
    const payload: FlareSolverrPostRequest = {
      cmd: 'request.post',
      url,
      postData,
    };

    if (cookies.length > 0) {
      payload.cookies = cookies;
    }

    return payload;
  }

  /**
   * Make a request through FlareSolverr
   */
  private async requestViaFlareSolverr<T>(
    url: string,
    options: RequestInit,
    asBuffer: false
  ): Promise<RequestServiceResponse<T>>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async requestViaFlareSolverr<T = ArrayBuffer>(
    url: string,
    options: RequestInit,
    asBuffer: true
  ): Promise<RequestServiceResponse<ArrayBuffer>>;
  private async requestViaFlareSolverr<T>(
    url: string,
    options: RequestInit = {},
    asBuffer = false
  ): Promise<RequestServiceResponse<ArrayBuffer | T>> {
    const flaresolverrUrl = this.flareSolverrUrl;
    if (!flaresolverrUrl) {
      throw new Error('FlareSolverr URL is not configured');
    }

    const domain = extractDomain(url);
    const apiUrl = `${flaresolverrUrl}/v1`;
    const method = options.method?.toUpperCase() || 'GET';

    // Get current cookies to pass to FlareSolverr
    const cookies = this.cookieJar.getCookiePairs(domain);

    // Build request payload
    const payload: FlareSolverrRequest =
      method === 'POST'
        ? this.buildFlareSolverrPostRequest(url, bodyInitToString(options.body), cookies)
        : this.buildFlareSolverrGetRequest(url, cookies);

    try {
      logger.debug('FlareSolverr', `Requesting ${url} via FlareSolverr at ${apiUrl}`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: options.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        logger.error(
          'FlareSolverr',
          `API error response: ${response.status} ${response.statusText} - ${errorText}`
        );
        throw new Error(`FlareSolverr API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as FlareSolverrResponse;

      logger.debug(
        'FlareSolverr',
        `Response status: ${data.status}, message: ${data.message || 'none'}`
      );

      if (data.status !== 'ok') {
        logger.error(
          'FlareSolverr',
          `FlareSolverr returned error status: ${data.status}, message: ${data.message || 'Unknown error'}`
        );
        throw new Error(`FlareSolverr error: ${data.message || 'Unknown error'}`);
      }

      if (!data.solution) {
        logger.error('FlareSolverr', 'FlareSolverr returned no solution in response');
        throw new Error('FlareSolverr returned no solution');
      }

      const solution = data.solution;

      // Store cookies from FlareSolverr solution in cookie jar for reuse in normal requests
      if (solution.cookies && solution.cookies.length > 0) {
        const cookieStrings = solution.cookies.map(cookie => `${cookie.name}=${cookie.value}`);
        this.cookieJar.setCookies(domain, cookieStrings);
        logger.debug(
          'FlareSolverr',
          `Stored ${solution.cookies.length} cookies in cookie jar for ${domain}`
        );
      }

      // Store user agent from FlareSolverr solution for reuse in normal requests
      if (solution.userAgent) {
        this.userAgentByDomain.set(domain, solution.userAgent);
        logger.debug('FlareSolverr', `Stored user agent for ${domain}`);
      }

      // Unwrap JSON from HTML if needed
      let responseBody = solution.response;
      if (isHtmlWrappedJson(responseBody)) {
        logger.debug('FlareSolverr', 'Detected HTML-wrapped JSON, unwrapping...');
        responseBody = unwrapJsonFromHtml(responseBody);
      }

      solution.headers = normalizeHeaders(solution.headers);

      const result: RequestServiceResponse<ArrayBuffer | T> = {
        body: responseBody,
        headers: solution.headers,
        ok: solution.status >= 200 && solution.status < 300,
        status: solution.status,
        statusText: solution.status >= 200 && solution.status < 300 ? 'OK' : 'Error',
      };

      if (asBuffer) {
        result.body = new TextEncoder().encode(responseBody).buffer;
      } else {
        const parsedBody = tryParseJSON<T>(responseBody);
        if (parsedBody) {
          result.body = parsedBody;
          // Set content-type if not present
          if (!solution.headers['content-type']) {
            solution.headers['content-type'] = 'application/json';
          }
        } else if (!solution.headers['content-type']) {
          solution.headers['content-type'] = 'text/html';
        }
      }

      logger.info(
        'FlareSolverr',
        `Successfully fetched ${url} via FlareSolverr (status: ${solution.status}, response length: ${solution.response.length})`
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        'FlareSolverr',
        `Failed to fetch ${url} via FlareSolverr: ${errorMessage}`,
        errorStack
      );
      throw error;
    }
  }

  /**
   * Make an HTTP request with cookie management, user agent rotation, and FlareSolverr support
   */
  async request(
    rawUrl: URL | string,
    options?: RequestOptions<true>
  ): Promise<RequestServiceResponse<ArrayBuffer>>;
  async request<T>(
    rawUrl: URL | string,
    options?: RequestOptions<false>
  ): Promise<RequestServiceResponse<T>>;
  async request<T>(
    rawUrl: URL | string,
    options?: RequestOptions<boolean>
  ): Promise<RequestServiceResponse<ArrayBuffer | T>> {
    // Start tracking metrics
    const requestMetricId = this.statsService.metricStart('request');
    const successMetricId = this.statsService.metricStart('request.success');
    const errorMetricId = this.statsService.metricStart('request.error');

    const { headers = {}, queryString, timeout, ...fetchOptions } = options ?? {};

    // Build URL with query string
    const urlObj = buildUrlWithQuery(rawUrl, queryString);
    const urlString = urlObj.toString();
    const domain = extractDomain(urlObj);

    const controller = new AbortController();
    const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;

    // Check if we have FlareSolverr solution cookie for this domain
    const hasFlareSolverrCookies =
      this.isFlareSolverrEnabled && this.cookieJar.hasCookie(domain, 'cf_clearance');

    try {
      // Get stored cookies and userAgent for this domain
      const cookieHeader = this.cookieJar.getCookieHeader(domain);
      const userAgent = this.userAgentByDomain.get(domain) || getRandomUserAgent();

      const requestHeaders: Record<string, string> = {
        'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8,it;q=0.7,pl;q=0.6,lt;q=0.5',
        priority: 'u=0, i',
        referer: urlObj.origin + '/',
        'user-agent': userAgent,
        ...Object.fromEntries(Object.entries(headers)),
      };
      // Add cookies if available
      if (cookieHeader) {
        requestHeaders['Cookie'] = cookieHeader;
      }

      // First do the normal request
      const response = await fetch(urlString, {
        ...fetchOptions,
        signal: controller.signal,
        headers: requestHeaders,
      });

      clearTimeout(timeoutId);

      // If we get a 403 and FlareSolverr is enabled, retry through FlareSolverr
      if (response.status === 403 && this.isFlareSolverrEnabled) {
        logger.warn('FlareSolverr', `Received 403 for ${urlString}, retrying through FlareSolverr`);
        // Track FlareSolverr usage
        this.statsService.event('request.flaresolverr');
        try {
          // FlareSolverr will handle the request and return solved cookies/user agent
          const flareResponse = options?.asBuffer
            ? await this.requestViaFlareSolverr(
                urlString,
                {
                  ...fetchOptions,
                  signal: controller.signal,
                  headers: requestHeaders,
                },
                true
              )
            : await this.requestViaFlareSolverr<T>(
                urlString,
                {
                  ...fetchOptions,
                  signal: controller.signal,
                  headers: requestHeaders,
                },
                false
              );
          logger.info(
            'FlareSolverr',
            `FlareSolverr retry successful for ${urlString} (status: ${flareResponse.status})`
          );
          // Note: This is NOT a "solved" request - we had to call FlareSolverr again
          this.statsService.metricEnd(successMetricId);
          this.statsService.metricEnd(requestMetricId);
          this.statsService.metricCancel(errorMetricId);
          return flareResponse;
        } catch (flareError) {
          const errorMessage =
            flareError instanceof Error ? flareError.message : String(flareError);
          const errorStack = flareError instanceof Error ? flareError.stack : undefined;
          logger.error(
            'FlareSolverr',
            `FlareSolverr retry failed for ${urlString}: ${errorMessage}`,
            errorStack
          );
          // FlareSolverr failed, so this is an error
          this.statsService.metricEnd(errorMetricId);
          this.statsService.metricEnd(requestMetricId);
          this.statsService.metricCancel(successMetricId);
          // Return the original 403 response if FlareSolverr fails
          return {
            body: await parseResponseBody<T>(response),
            headers: normalizeHeaders(response.headers),
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
          };
        }
      }

      if (hasFlareSolverrCookies) {
        this.statsService.event('request.solved');
      }

      // Obtain the cookies from the response
      const setCookieHeaders = response.headers.getSetCookie();
      if (setCookieHeaders) {
        this.cookieJar.setCookies(domain, setCookieHeaders);
      }
      // Request was successful, store the user agent for this domain
      this.userAgentByDomain.set(domain, userAgent);

      this.statsService.metricEnd(successMetricId);
      this.statsService.metricEnd(requestMetricId);
      this.statsService.metricCancel(errorMetricId);

      return {
        body: options?.asBuffer
          ? await response.arrayBuffer()
          : await parseResponseBody<T>(response),
        headers: normalizeHeaders(response.headers),
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      this.statsService.metricEnd(errorMetricId);
      this.statsService.metricEnd(requestMetricId);
      this.statsService.metricCancel(successMetricId);
      throw error;
    }
  }
}
