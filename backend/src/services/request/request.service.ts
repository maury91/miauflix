import { RequestError } from '@errors/request.errors';
import type { ConfigService } from '@mytypes/configuration';
import type { StatsService } from '@services/stats/stats.service';
import { normalizeHeaders, parseResponseBody } from '@utils/http.util';
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
  body?: RequestInit['body'];
  signal?: AbortSignal;
  redirect?: RequestInit['redirect'];
  asBuffer?: B;
  maxResponseBytes?: number;
}

export interface RequestServiceResponse<T> {
  body: T | string;
  headers: Record<string, string>;
  ok: boolean;
  status: number;
  statusText: string;
}

async function readResponseWithLimit<T>(
  response: Response,
  maxResponseBytes: number,
  asBuffer: boolean
): Promise<ArrayBuffer | T | string> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    await response.body?.cancel();
    throw new RequestError(`Response exceeds ${maxResponseBytes} byte limit`, 'response_too_large');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return asBuffer ? new ArrayBuffer(0) : ('' as T | string);
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxResponseBytes) {
      await reader.cancel();
      throw new RequestError(
        `Response exceeds ${maxResponseBytes} byte limit`,
        'response_too_large'
      );
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (asBuffer) {
    return bytes.buffer;
  }

  const text = new TextDecoder().decode(bytes);
  const contentType = response.headers.get('content-type');
  if (!contentType || contentType.toLowerCase().includes('application/json')) {
    try {
      return JSON.parse(text) as T;
    } catch {
      return text;
    }
  }
  return text;
}

/** HTTP requests for non-source backend integrations. */
export class RequestService {
  private readonly cookieJar: CookieJar;
  private readonly userAgentByDomain: Map<string, string>;

  constructor(
    private readonly statsService: StatsService,
    _config: ConfigService
  ) {
    this.cookieJar = new CookieJar();
    this.userAgentByDomain = new Map<string, string>();
  }

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

    const { headers = {}, queryString, timeout, maxResponseBytes, ...fetchOptions } = options ?? {};

    // Build URL with query string
    const urlObj = buildUrlWithQuery(rawUrl, queryString);
    const urlString = urlObj.toString();
    const domain = extractDomain(urlObj);

    // Merge user signal with timeout if both provided
    let timeoutId: NodeJS.Timeout | undefined;
    let signal: AbortSignal | undefined = fetchOptions.signal;

    if (timeout) {
      const timeoutController = new AbortController();
      timeoutId = setTimeout(() => timeoutController.abort(), timeout);
      if (signal) {
        signal = AbortSignal.any
          ? AbortSignal.any([signal, timeoutController.signal])
          : timeoutController.signal;
      } else {
        signal = timeoutController.signal;
      }
    }

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
        signal,
        headers: requestHeaders,
      });

      // Obtain the cookies from the response
      const setCookieHeaders = response.headers.getSetCookie();
      if (setCookieHeaders) {
        this.cookieJar.setCookies(domain, setCookieHeaders);
      }
      // Request was successful, store the user agent for this domain
      this.userAgentByDomain.set(domain, userAgent);

      const body = maxResponseBytes
        ? await readResponseWithLimit<T>(response, maxResponseBytes, options?.asBuffer === true)
        : options?.asBuffer
          ? await response.arrayBuffer()
          : await parseResponseBody<T>(response);

      this.statsService.metricEnd(successMetricId);
      this.statsService.metricEnd(requestMetricId);
      this.statsService.metricCancel(errorMetricId);

      return {
        body,
        headers: normalizeHeaders(response.headers),
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error: unknown) {
      this.statsService.metricEnd(errorMetricId);
      this.statsService.metricEnd(requestMetricId);
      this.statsService.metricCancel(successMetricId);
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}
