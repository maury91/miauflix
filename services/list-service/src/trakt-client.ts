import { z } from 'zod';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
let traktCooldownUntil = 0;

const waitForCooldown = async (): Promise<void> => {
  while (true) {
    const remaining = traktCooldownUntil - Date.now();
    if (remaining <= 0) return;
    await new Promise<void>(resolve => setTimeout(resolve, Math.min(remaining, 30_000)));
  }
};

const deviceCodeSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_url: z.string().url(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive(),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});
const profileSchema = z.object({
  username: z.string().min(1),
  ids: z.object({ slug: z.string().min(1) }),
});

export class TraktProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

export class TraktClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly apiUrl: string,
    private readonly redirectUri: string,
    private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  ) {}

  private async requestWithHeaders(
    path: string,
    init: RequestInit = {},
    accessToken?: string
  ): Promise<{ data: unknown; headers: Headers }> {
    try {
      await waitForCooldown();
      const response = await fetch(`${this.apiUrl}${path}`, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(this.requestTimeoutMs),
        headers: {
          'trakt-api-version': '2',
          'trakt-api-key': this.clientId,
          'content-type': 'application/json',
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          ...(init.headers ?? {}),
        },
      });
      if (!response.ok) {
        const body = await response.text();
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 5;
          traktCooldownUntil = Math.max(
            traktCooldownUntil,
            Date.now() + Math.min(seconds, 30) * 1000
          );
        }
        throw new TraktProviderError(`Trakt API ${response.status}: ${body}`, response.status);
      }
      try {
        return { data: await response.json(), headers: response.headers };
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'AbortError' || error.name === 'TimeoutError')
        )
          throw error;
        throw new TraktProviderError('Trakt API returned invalid JSON', 502);
      }
    } catch (error) {
      if (error instanceof TraktProviderError) throw error;
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
      ) {
        throw new TraktProviderError('Trakt API request timed out', 504);
      }
      throw error;
    }
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
    accessToken?: string
  ): Promise<T> {
    const { data } = await this.requestWithHeaders(path, init, accessToken);
    try {
      return schema.parse(data);
    } catch {
      throw new TraktProviderError('Trakt API returned an invalid response', 502);
    }
  }

  test(): Promise<unknown[]> {
    return this.request('/movies/popular?limit=1', z.array(z.unknown()));
  }

  deviceCode(): Promise<z.infer<typeof deviceCodeSchema>> {
    return this.request('/oauth/device/code', deviceCodeSchema, {
      method: 'POST',
      body: JSON.stringify({ client_id: this.clientId }),
    });
  }

  deviceToken(code: string): Promise<z.infer<typeof tokenSchema>> {
    return this.request('/oauth/device/token', tokenSchema, {
      method: 'POST',
      body: JSON.stringify({ code, client_id: this.clientId, client_secret: this.clientSecret }),
    });
  }

  refreshToken(refreshToken: string): Promise<z.infer<typeof tokenSchema>> {
    return this.request('/oauth/token', tokenSchema, {
      method: 'POST',
      body: JSON.stringify({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'refresh_token',
      }),
    });
  }

  profile(accessToken: string): Promise<z.infer<typeof profileSchema>> {
    return this.request('/users/me', profileSchema, {}, accessToken);
  }

  revoke(accessToken: string): Promise<unknown> {
    return this.request('/oauth/revoke', z.unknown(), {
      method: 'POST',
      body: JSON.stringify({
        token: accessToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
  }

  async page<T>(
    path: string,
    accessToken?: string
  ): Promise<{ items: T[]; totalPages: number; totalItems: number }> {
    const response = await this.requestWithHeaders(path, {}, accessToken);
    const items = z.array(z.unknown()).safeParse(response.data);
    if (!items.success) throw new TraktProviderError('Trakt API returned an invalid page', 502);
    const parsePaginationHeader = (name: string, minimum: number) => {
      const value = response.headers.get(name);
      if (!value || !/^\d+$/.test(value))
        throw new TraktProviderError(`Trakt API returned an invalid ${name} header`, 502);
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < minimum)
        throw new TraktProviderError(`Trakt API returned an invalid ${name} header`, 502);
      return parsed;
    };
    const totalPages = parsePaginationHeader('X-Pagination-Page-Count', 1);
    const totalItems = parsePaginationHeader('X-Pagination-Item-Count', 0);
    return {
      items: items.data as T[],
      totalPages,
      totalItems,
    };
  }
}
