const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

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
    private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  ) {}

  async request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
    const { data } = await this.requestWithHeaders<T>(path, init, accessToken);
    return data;
  }

  private async requestWithHeaders<T>(
    path: string,
    init: RequestInit = {},
    accessToken?: string
  ): Promise<{ data: T; headers: Headers }> {
    try {
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
        throw new TraktProviderError(`Trakt API ${response.status}: ${body}`, response.status);
      }
      return { data: (await response.json()) as T, headers: response.headers };
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

  test(): Promise<unknown> {
    return this.request('/movies/popular?limit=1');
  }

  deviceCode(): Promise<{
    device_code: string;
    user_code: string;
    verification_url: string;
    expires_in: number;
    interval: number;
  }> {
    return this.request('/oauth/device/code', {
      method: 'POST',
      body: JSON.stringify({ client_id: this.clientId }),
    });
  }

  deviceToken(
    code: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    return this.request('/oauth/device/token', {
      method: 'POST',
      body: JSON.stringify({ code, client_id: this.clientId, client_secret: this.clientSecret }),
    });
  }

  profile(accessToken: string): Promise<{ username: string; ids: { slug: string } }> {
    return this.request('/users/me', {}, accessToken);
  }

  revoke(accessToken: string): Promise<unknown> {
    return this.request('/oauth/revoke', {
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
    const response = await this.requestWithHeaders<T[]>(path, {}, accessToken);
    const totalPages = Number(response.headers.get('X-Pagination-Page-Count') ?? '0');
    const totalItems = Number(response.headers.get('X-Pagination-Item-Count') ?? '0');
    return {
      items: response.data,
      totalPages: Number.isSafeInteger(totalPages) && totalPages >= 0 ? totalPages : 0,
      totalItems: Number.isSafeInteger(totalItems) && totalItems >= 0 ? totalItems : 0,
    };
  }
}
