import type { ResolveHost } from '../src/http/destination';
import type { Fetch } from '../src/http/http-client';

// DNS and wire traffic are both injected: offline tests must never resolve real providers.
export const fixtureResolver: ResolveHost = async () => [{ address: '93.184.216.34', family: 4 }];
export const fixtureFetch = (
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>
): Fetch =>
  ((input: URL | string | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const host = new Headers(init.headers).get('host');
    if (host) url.host = host;
    return handler(url, init);
  }) as Fetch;
