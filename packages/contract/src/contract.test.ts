import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  bytes,
  call,
  connect,
  contract,
  ContractError,
  createClient,
  defineService,
  event,
  isContractError,
  localTransport,
  type ManagedConfiguration,
  type RemoteConnection,
  type RunningServer,
  serve,
  type Service,
  signedBytesPath,
  stream,
  type Transport,
} from './index.js';

const demo = contract('demo', '1.0', {
  echo: call<{ text: string }, { text: string }>(),
  get: call<{ id: number }, string, 'not_found'>({ dedupe: true }),
  binary: call<void, Uint8Array>(),
  slow: call<void, string>(),
  boom: call<void, never>(),
  count: stream<{ to: number }, number>(),
  ticks: event<number, { even?: boolean }>(),
  file: bytes<{ name: string }, 'missing'>({ status: { missing: 404 } }),
});

const FILE = new TextEncoder().encode('0123456789');

const setup = () => {
  const listeners = new Set<() => void>();
  let ready = true;
  const configuration: ManagedConfiguration = {
    getSchema: () => ({ groups: [] }),
    get ready() {
      return ready;
    },
    test: async () => ({ success: true, mode: 'validation', message: 'ok' }),
    applyRemote: async () => ({ success: true, activated: true }),
    clearRemote: async () => ({ success: true, activated: false }),
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const setReady = (value: boolean) => {
    ready = value;
    for (const listener of listeners) listener();
  };
  const tickListeners = new Set<(value: number) => void>();
  const stats = { getCalls: 0, slowAborted: false, streamAborted: false, errors: [] as unknown[] };

  const service = defineService({
    info: { id: 'demo', name: 'Demo', description: 'Test service', version: '1.0.0' },
    configuration,
    onError: (_, error) => stats.errors.push(error),
  }).implement(demo, {
    echo: ({ text }) => ({ text }),
    get: async ({ id }, ctx) => {
      stats.getCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 10));
      return id === 1 ? 'one' : ctx.fail('not_found', `No item ${id}`);
    },
    binary: () => new Uint8Array([1, 2, 3]),
    slow: (_, ctx) =>
      new Promise(resolve => {
        const timer = setTimeout(() => resolve('late'), 5_000);
        ctx.signal.addEventListener('abort', () => {
          stats.slowAborted = true;
          clearTimeout(timer);
          resolve('aborted');
        });
      }),
    boom: () => {
      throw new Error('secret detail');
    },
    count: async function* ({ to }, ctx) {
      let i = 0;
      try {
        for (; i < to && !ctx.signal.aborted; i++) {
          yield i;
          await new Promise(resolve => setImmediate(resolve));
        }
      } finally {
        if (i < to) stats.streamAborted = true;
      }
    },
    ticks: (emit, filter) => {
      const listener = (value: number) => {
        if (!filter?.even || value % 2 === 0) emit(value);
      };
      tickListeners.add(listener);
      return () => tickListeners.delete(listener);
    },
    file: ({ name }, ctx) => {
      if (name !== 'a.txt') ctx.fail('missing', 'No such file');
      const range = /bytes=(\d+)-(\d+)/.exec(ctx.headers.get('range') ?? '');
      if (!range) return new Response(FILE, { status: 200 });
      const [start, end] = [Number(range[1]), Number(range[2])];
      return new Response(FILE.slice(start, end + 1), {
        status: 206,
        headers: { 'content-range': `bytes ${start}-${end}/${FILE.length}` },
      });
    },
  });
  const tick = (value: number) => {
    for (const listener of tickListeners) listener(value);
  };
  return { service, setReady, tick, stats, tickCount: () => tickListeners.size };
};

const until = async (check: () => boolean, timeoutMs = 2_000) => {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('Condition not met in time');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

type Harness = {
  transport: Transport;
  bytesBase: string;
  close: () => Promise<void>;
  connection?: RemoteConnection;
  server?: RunningServer;
};

const TICKET_KEY = 'test-ticket-key';

const harnesses: Record<string, (service: Service) => Promise<Harness>> = {
  local: async service => {
    // Serve the service's HTTP side so `bytes` URLs resolve, as a host would.
    const server = await serve(service, { hostname: '127.0.0.1', port: 0 });
    const base = `http://127.0.0.1:${server.port}`;
    return {
      transport: localTransport(service, { bytesBaseUrl: base, ticketKey: TICKET_KEY }),
      bytesBase: base,
      close: () => server.stop(),
      server,
    };
  },
  remote: async service => {
    const server = await serve(service, { hostname: '127.0.0.1', port: 0 });
    const base = `http://127.0.0.1:${server.port}`;
    const connection = connect({ url: base, ticketKey: TICKET_KEY, timeoutMs: 2_000 });
    await connection.ready();
    return {
      transport: connection.transport,
      bytesBase: base,
      connection,
      server,
      close: async () => {
        connection.close();
        await server.stop();
      },
    };
  },
};

for (const [mode, create] of Object.entries(harnesses)) {
  describe(`${mode} transport`, () => {
    const start = async () => {
      const fixture = setup();
      const harness = await create(fixture.service);
      return { ...fixture, harness, client: createClient(demo, harness.transport) };
    };

    test('calls round-trip', async () => {
      const { client, harness } = await start();
      try {
        assert.deepEqual(await client.echo({ text: 'hi' }), { text: 'hi' });
        assert.deepEqual([...(await client.binary())], [1, 2, 3]);
      } finally {
        await harness.close();
      }
    });

    test('declared and internal errors', async () => {
      const { client, harness, stats } = await start();
      try {
        await assert.rejects(client.get({ id: 2 }), error => {
          assert.ok(isContractError(error, 'not_found'));
          assert.equal(error.message, 'No item 2');
          return true;
        });
        await assert.rejects(client.boom(), error => {
          assert.ok(isContractError(error, 'internal'));
          assert.doesNotMatch(error.message, /secret/);
          return true;
        });
        assert.equal(stats.errors.length, 1);
      } finally {
        await harness.close();
      }
    });

    test('data plane is gated on readiness', async () => {
      const { client, harness, setReady } = await start();
      try {
        setReady(false);
        await assert.rejects(client.echo({ text: 'x' }), error =>
          isContractError(error, 'not_configured')
        );
        setReady(true);
        assert.deepEqual(await client.echo({ text: 'x' }), { text: 'x' });
      } finally {
        await harness.close();
      }
    });

    test('dedupe shares one in-flight call', async () => {
      const { client, harness, stats } = await start();
      try {
        const [a, b] = await Promise.all([client.get({ id: 1 }), client.get({ id: 1 })]);
        assert.equal(a, 'one');
        assert.equal(b, 'one');
        assert.equal(stats.getCalls, 1);
      } finally {
        await harness.close();
      }
    });

    test('timeouts reject and cancel the implementation', async () => {
      const { client, harness, stats } = await start();
      try {
        await assert.rejects(client.slow(undefined, { timeoutMs: 20 }), error =>
          isContractError(error, 'timeout')
        );
        await until(() => stats.slowAborted);
      } finally {
        await harness.close();
      }
    });

    test('streams deliver past the credit window, in order', async () => {
      const { client, harness } = await start();
      try {
        const items: number[] = [];
        for await (const item of client.count({ to: 300 })) items.push(item);
        assert.deepEqual(
          items,
          Array.from({ length: 300 }, (_, i) => i)
        );
      } finally {
        await harness.close();
      }
    });

    test('breaking out of a stream cancels it', async () => {
      const { client, harness, stats } = await start();
      try {
        for await (const item of client.count({ to: 100_000 })) if (item === 5) break;
        await until(() => stats.streamAborted);
      } finally {
        await harness.close();
      }
    });

    test('events honour filters and re-attach after readiness returns', async () => {
      const { client, harness, tick, setReady, tickCount } = await start();
      try {
        const received: number[] = [];
        let resyncs = 0;
        const off = client.ticks.on(value => received.push(value), {
          filter: { even: true },
          onResync: () => (resyncs += 1),
        });
        await until(() => tickCount() === 1);
        tick(1);
        tick(2);
        await until(() => received.length === 1);
        assert.deepEqual(received, [2]);

        setReady(false);
        await until(() => tickCount() === 0);
        setReady(true);
        await until(() => tickCount() === 1);
        assert.equal(resyncs, 1);
        tick(4);
        await until(() => received.length === 2);

        off();
        await until(() => tickCount() === 0);
      } finally {
        await harness.close();
      }
    });

    test('bytes: signed URLs, ranges and typed errors', async () => {
      const { client, harness } = await start();
      try {
        const url = client.file.url({ name: 'a.txt' });
        assert.ok(url.startsWith(`${harness.bytesBase}/_b/demo@1.file?t=`));
        const whole = await fetch(url);
        assert.equal(await whole.text(), '0123456789');
        const ranged = await fetch(url, { headers: { range: 'bytes=2-4' } });
        assert.equal(ranged.status, 206);
        assert.equal(await ranged.text(), '234');

        const opened = await client.file.open(
          { name: 'a.txt' },
          { headers: { range: 'bytes=0-1' } }
        );
        assert.equal(await opened.text(), '01');
        await assert.rejects(client.file.open({ name: 'b.txt' }), error =>
          isContractError(error, 'missing')
        );
        const missing = await fetch(client.file.url({ name: 'b.txt' }));
        assert.equal(missing.status, 404);
        assert.equal((await missing.json()).error, 'No such file');

        const tampered = await fetch(
          url.replace(/t=[^.]+/, `t=${Buffer.from('{"name":"x"}').toString('base64url')}`)
        );
        assert.equal(tampered.status, 403);
        const expired = await fetch(
          `${harness.bytesBase}${signedBytesPath(TICKET_KEY, 'demo@1.file', { name: 'a.txt' }, -10)}`
        );
        assert.equal(expired.status, 403);
      } finally {
        await harness.close();
      }
    });

    test('management is always reachable', async () => {
      const { harness, setReady } = await start();
      try {
        const { management } = await import('./management.js');
        const admin = createClient(management, harness.transport);
        setReady(false);
        assert.deepEqual(await admin.configSchema(), { groups: [] });
        assert.equal((await admin.status()).state, 'standby');
        assert.equal((await admin.applyConfig({ values: {} })).success, true);
      } finally {
        await harness.close();
      }
    });

    test('version window: adjacent majors side by side, newer minors degrade', async () => {
      const winV1 = contract('win', '1.0', { greet: call<string, string>() });
      const winV2 = contract('win', '2.1', {
        hello: call<{ name: string }, string>(),
        wave: call<void, string>({ since: 1 }),
      });
      // A caller built against a newer minor than the service implements.
      const winV2Next = contract('win', '2.2', {
        ...winV2.methods,
        bow: call<void, string>({ since: 2 }),
      });
      const service = defineService({
        info: { id: 'win', name: 'Win', description: '', version: '2.1.0' },
        configuration: setupConfig(),
      })
        .implement(winV1, { greet: name => `hi ${name}` })
        .implement(winV2, { hello: ({ name }) => `hello ${name}`, wave: () => 'wave' });
      assert.deepEqual(service.hello.contracts.win, ['1.0', '2.1']);
      const harness = await create(service);
      try {
        await until(() => harness.transport.minor?.('win', 2) !== undefined);
        assert.equal(await createClient(winV1, harness.transport).greet('a'), 'hi a');
        const next = createClient(winV2Next, harness.transport);
        assert.equal(await next.hello({ name: 'b' }), 'hello b');
        assert.equal(await next.wave(), 'wave');
        await assert.rejects(next.bow(), (error: unknown) => isContractError(error, 'unsupported'));
      } finally {
        await harness.close();
      }
    });
  });
}

test('a service implements each major once; since cannot exceed the minor', () => {
  const v1 = contract('dup', '1.0', { a: call<void, void>() });
  const builder = defineService({
    info: { id: 'dup', name: 'Dup', description: '', version: '0' },
    configuration: setupConfig(),
  }).implement(v1, { a: () => undefined });
  assert.throws(() =>
    builder.implement(contract('dup', '1.1', { a: call<void, void>() }), { a: () => undefined })
  );
  assert.throws(() => contract('bad', '1.0', { a: call<void, void>({ since: 1 }) }));
});

describe('remote connection lifecycle', () => {
  test('status never says ready while the data plane rejects calls', async () => {
    let attached = false;
    const service = defineService({
      info: { id: 'gap', name: 'Gap', description: '', version: '0' },
      configuration: setupConfig(),
      status: () => ({ state: 'ready' }),
      ready: () => attached,
    });
    assert.equal((await service.status()).state, 'configuring');
    attached = true;
    assert.equal((await service.status()).state, 'ready');
  });

  test('retries a subscription rejected as not_configured while the service reports ready', async () => {
    const gapEvents = contract('gap', '1.0', { ticks: event<number>() });
    const emitters = new Set<(value: number) => void>();
    let rejections = 1;
    const service = defineService({
      info: { id: 'gap', name: 'Gap', description: '', version: '0' },
      configuration: setupConfig(),
    }).implement(gapEvents, {
      ticks: emit => {
        // A data plane that lags the `ready` status once, then attaches.
        if (rejections-- > 0) throw new ContractError('not_configured', 'Not attached yet');
        emitters.add(emit);
        return () => emitters.delete(emit);
      },
    });
    const server = await serve(service, { hostname: '127.0.0.1', port: 0 });
    const connection = connect({ url: `http://127.0.0.1:${server.port}`, timeoutMs: 1_000 });
    try {
      await connection.ready();
      await until(() => connection.status?.state === 'ready');
      const received: number[] = [];
      createClient(gapEvents, connection.transport).ticks.on(value => received.push(value));
      await until(() => emitters.size === 1, 3_000);
      for (const emit of emitters) emit(7);
      await until(() => received.length === 1);
      assert.deepEqual(received, [7]);
    } finally {
      connection.close();
      await server.stop();
    }
  });

  test('reconnects after the service restarts and resyncs subscriptions', async () => {
    const fixture = setup();
    let server = await serve(fixture.service, { hostname: '127.0.0.1', port: 0 });
    const port = server.port;
    const connection = connect({ url: `http://127.0.0.1:${port}`, timeoutMs: 1_000 });
    try {
      await connection.ready();
      const client = createClient(demo, connection.transport);
      let resyncs = 0;
      client.ticks.on(() => undefined, { onResync: () => (resyncs += 1) });
      await until(() => fixture.tickCount() === 1);

      await server.stop();
      await until(() => connection.state !== 'ready');
      await assert.rejects(client.echo({ text: 'x' }), error =>
        isContractError(error, 'unavailable')
      );

      const second = setup();
      server = await serve(second.service, { hostname: '127.0.0.1', port });
      await connection.ready(5_000);
      assert.deepEqual(await client.echo({ text: 'back' }), { text: 'back' });
      await until(() => second.tickCount() === 1);
      assert.equal(resyncs, 1);
    } finally {
      connection.close();
      await server.stop();
    }
  });

  test('a wrong token never becomes ready', async () => {
    const fixture = setup();
    const service = defineService({
      info: fixture.service.info,
      configuration: setupConfig(),
      token: 'right',
    });
    const server = await serve(service, { hostname: '127.0.0.1', port: 0 });
    const connection = connect({ url: `http://127.0.0.1:${server.port}`, token: 'wrong' });
    try {
      await assert.rejects(connection.ready(300));
    } finally {
      connection.close();
      await server.stop();
    }
  });
});

const setupConfig = (): ManagedConfiguration => ({
  getSchema: () => ({ groups: [] }),
  ready: true,
  test: async () => ({ success: true, mode: 'validation', message: 'ok' }),
  applyRemote: async () => ({ success: true, activated: true }),
  clearRemote: async () => ({ success: true, activated: false }),
  subscribe: () => () => undefined,
});

/* ---------- type-level checks (compile only) ---------- */

export const typeChecks = (transport: Transport) => {
  const client = createClient(demo, transport);
  // @ts-expect-error missing input
  void client.echo();
  // @ts-expect-error wrong input shape
  void client.echo({ txt: 'x' });
  void client.binary();
  const text: Promise<{ text: string }> = client.echo({ text: 'x' });
  // @ts-expect-error filter is typed
  client.ticks.on(() => undefined, { filter: { odd: true } });
  defineService({
    info: { id: 'x', name: 'x', description: '', version: '0' },
    configuration: setupConfig(),
    // @ts-expect-error implementations are complete and typed
  }).implement(demo, { echo: ({ text }) => ({ text }) });
  return text;
};
