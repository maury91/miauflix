import { expect, it } from 'bun:test';

import { HttpClient, RateLimitError } from '../src/http/http-client';
import { SingleFlight, withAbort } from '../src/util/single-flight';
import { fixtureFetch, fixtureResolver } from './http-fixture';

const client = (
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
  timeout = 1000,
  solver = ''
) =>
  new HttpClient(
    { timeout: () => timeout, flareSolverr: () => solver },
    fixtureFetch(handler),
    Date.now,
    fixtureResolver
  );
it('skips an exhausted background host without making a request or charging budget', async () => {
  let calls = 0,
    charges = 0;
  const http = client(() => {
    calls++;
    return new Response('ok');
  });
  const options = {
    perMinute: 1,
    maxRateWaitMs: 0,
    beforeRequest: () => {
      charges++;
    },
  };
  await http.request('https://provider.invalid/first', options);
  const error = await http
    .request('https://provider.invalid/second', options)
    .catch(error => error);
  expect(error).toBeInstanceOf(RateLimitError);
  expect(error.retryAt).toBeGreaterThan(Date.now());
  expect(calls).toBe(1);
  expect(charges).toBe(1);
});
it('rejects an interactive wait exceeding its allowance without timing out the provider', async () => {
  const http = client(() => new Response('ok'));
  await http.request('https://provider.invalid/first', { perMinute: 1 });
  await expect(
    http.request('https://provider.invalid/second', { perMinute: 1, maxRateWaitMs: 1000 })
  ).rejects.toBeInstanceOf(RateLimitError);
});
it('honors ordinary host spacing even with background token waiting disabled', async () => {
  const http = client(() => new Response('ok'));
  await http.request('https://provider.invalid/first', { minIntervalMs: 5 });
  expect((await http.request('https://provider.invalid/second', { maxRateWaitMs: 0 })).ok).toBe(
    true
  );
});
it('rotates desktop user agents and honors an explicit agent', async () => {
  const agents: string[] = [];
  const http = client((_url, init) => {
    agents.push(new Headers(init.headers).get('user-agent')!);
    return new Response('ok');
  });
  await http.request('https://provider.invalid/1');
  await http.request('https://provider.invalid/2');
  await http.request('https://provider.invalid/3', { headers: { 'user-agent': 'test-agent' } });
  expect(agents[0]).not.toBe(agents[1]);
  expect(agents[2]).toBe('test-agent');
});
it('bounds an untrusted body stream and cancels its reader', async () => {
  let canceled = false;
  const http = client(
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(20));
          },
          cancel() {
            canceled = true;
          },
        })
      )
  );
  await expect(http.request('https://provider.invalid/large', { maxBytes: 10 })).rejects.toThrow(
    'byte limit'
  );
  expect(canceled).toBe(true);
});
it('times out a stalled body even when the injected stream ignores AbortSignal', async () => {
  let canceled = false;
  const http = client(
    () =>
      new Response(
        new ReadableStream({
          cancel() {
            canceled = true;
          },
        })
      ),
    10
  );
  const error = await http.request('https://provider.invalid/stalled').catch(error => error);
  expect(error.name).toBe('TimeoutError');
  expect(canceled).toBe(true);
});
it('carries one timeout across redirects and refuses redirect loops', async () => {
  let calls = 0;
  const http = client(() => {
    calls++;
    return new Response(null, { status: 302, headers: { location: '/again' } });
  });
  await expect(http.request('https://provider.invalid/')).rejects.toThrow('Too many redirects');
  expect(calls).toBe(6);
});
it('changes a redirected POST to GET and strips credentials when the origin changes', async () => {
  const seen: RequestInit[] = [];
  const http = client((url, init) => {
    seen.push(init);
    return url.hostname === 'first.invalid'
      ? new Response(null, { status: 302, headers: { location: 'https://next.invalid/' } })
      : new Response('ok');
  });
  await http.request('https://first.invalid/', {
    method: 'POST',
    body: 'secret',
    headers: {
      authorization: 'Bearer private',
      cookie: 'session=private',
      'content-type': 'application/json',
    },
  });
  expect(seen[1].method).toBe('GET');
  expect(seen[1].body).toBeUndefined();
  expect(new Headers(seen[1].headers).has('authorization')).toBe(false);
  expect(new Headers(seen[1].headers).has('cookie')).toBe(false);
});
it('does not follow a manual redirect', async () => {
  let calls = 0;
  const http = client(() => {
    calls++;
    return new Response(null, { status: 302, headers: { location: '/' } });
  });
  expect((await http.request('https://provider.invalid/', { redirect: 'manual' })).status).toBe(
    302
  );
  expect(calls).toBe(1);
});
it('uses a bounded FlareSolverr envelope and rejects an oversized decoded solution', async () => {
  const http = client(
    url =>
      url.host === 'solver.invalid'
        ? Response.json({ status: 'ok', solution: { status: 200, response: 'x'.repeat(41) } })
        : new Response('Just a moment', { status: 403 }),
    1000,
    'https://solver.invalid'
  );
  await expect(http.request('https://provider.invalid/', { maxBytes: 40 })).rejects.toThrow(
    'byte limit'
  );
});
it('one canceled caller does not cancel another caller sharing the same operation', async () => {
  const flights = new SingleFlight(),
    first = new AbortController(),
    second = new AbortController();
  let finish!: (value: number) => void;
  let shared!: AbortSignal;
  let calls = 0;
  const operation = (signal: AbortSignal) => {
    calls++;
    shared = signal;
    return new Promise<number>(resolve => {
      finish = resolve;
    });
  };
  const a = flights.runCancelable('same', first.signal, operation).catch(error => error);
  const b = flights.runCancelable('same', second.signal, operation);
  await Promise.resolve();
  first.abort(new Error('left'));
  expect((await a).message).toBe('left');
  expect(shared.aborted).toBe(false);
  finish(42);
  expect(await b).toBe(42);
  expect(calls).toBe(1);
});
it('cancels shared work once its last caller leaves and permits a fresh operation', async () => {
  const flights = new SingleFlight(),
    caller = new AbortController();
  let shared!: AbortSignal;
  const pending = flights
    .runCancelable('same', caller.signal, signal => {
      shared = signal;
      return withAbort(new Promise<number>(() => {}), signal);
    })
    .catch(error => error);
  await Promise.resolve();
  caller.abort();
  await pending;
  expect(shared.aborted).toBe(true);
  expect(await flights.runCancelable('same', new AbortController().signal, async () => 2)).toBe(2);
});
it('shares a GET URL across callers and returns independent response bodies', async () => {
  let calls = 0;
  const http = client(() => {
    calls++;
    return Response.json({ ok: true });
  });
  const [first, second] = await Promise.all([
    http.request('https://same.invalid/a'),
    http.request('https://same.invalid/a'),
  ]);
  expect(await first.json()).toEqual({ ok: true });
  expect(await second.json()).toEqual({ ok: true });
  expect(calls).toBe(1);
});

it('does not space requests to internal hosts but still charges budget', async () => {
  let charges = 0;
  const http = client(() => new Response('ok'));
  const options = {
    perMinute: 1,
    minIntervalMs: 5000,
    maxRateWaitMs: 0,
    beforeRequest: () => {
      charges++;
    },
  };
  const started = Date.now();
  await http.request('http://yts-mock/one', options);
  await http.request('http://yts-mock/two', options);
  expect(Date.now() - started).toBeLessThan(1000);
  expect(charges).toBe(2);
});

it('refuses internal destinations for provider-supplied URLs, including redirects', async () => {
  const http = client(url =>
    url.host === 'cdn.example.test'
      ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/x' } })
      : new Response('ok')
  );
  await expect(http.request('http://127.0.0.1/a.torrent', { blockInternal: true })).rejects.toThrow(
    'internal'
  );
  await expect(
    http.request('https://cdn.example.test/a.torrent', { blockInternal: true })
  ).rejects.toThrow('internal');
  const allowed = await http.request('http://yts-mock/a.torrent', {
    blockInternal: true,
    allowHosts: ['yts-mock'],
  });
  expect(await allowed.text()).toBe('ok');
});
