import assert from 'node:assert/strict';
import { test } from 'node:test';

import { vpnConfigVariables, VpnGuard, type VpnGuardSettings, vpnSettingsFrom } from './index.js';

const setup = (answer: () => unknown, initial: Partial<VpnGuardSettings> = {}) => {
  let now = 0;
  let calls = 0;
  const settings: VpnGuardSettings = { disabled: false, knownVpnIps: '', ...initial };
  const guard = new VpnGuard({
    settings: () => settings,
    fetchJson: async (_url, { signal }) => {
      calls++;
      signal?.throwIfAborted();
      return answer();
    },
    now: () => now,
  });
  return {
    guard,
    settings,
    calls: () => calls,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

test('reports protected from NordVPN and caches it for five minutes', async () => {
  const { guard, calls, advance } = setup(() => ({ protected: true, ip: '1.2.3.4' }));
  assert.equal(guard.state, 'unprotected');
  assert.equal(await guard.isProtected(), true);
  assert.equal(guard.state, 'protected');
  advance(299_999);
  await guard.isProtected();
  assert.equal(calls(), 1);
  advance(1);
  await guard.isProtected();
  assert.equal(calls(), 2);
});

test('accepts a known VPN IP that NordVPN does not recognise', async () => {
  const { guard } = setup(() => ({ protected: false, ip: '5.6.7.8' }), {
    knownVpnIps: '1.1.1.1, 5.6.7.8',
  });
  assert.equal(await guard.isProtected(), true);
});

test('fails closed and retries a failure after 30 seconds', async () => {
  const { guard, calls, advance } = setup(() => {
    throw new Error('offline');
  });
  assert.equal(await guard.isProtected(), false);
  assert.equal(guard.state, 'unprotected');
  advance(29_999);
  await guard.isProtected();
  assert.equal(calls(), 1);
  advance(1);
  await guard.isProtected();
  assert.equal(calls(), 2);
});

test('a caller that gives up rejects, without failing the check for the others', async () => {
  const { guard, calls } = setup(() => ({ protected: true }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(guard.isProtected(controller.signal));
  assert.equal(await guard.isProtected(), true);
  assert.equal(calls(), 1);
});

test('concurrent checks share one request', async () => {
  let release!: () => void;
  const answered = new Promise<void>(resolve => (release = resolve));
  const { guard, calls } = setup(async () => {
    await answered;
    return { protected: true };
  });
  const checks = [guard.isProtected(), guard.isProtected(), guard.isProtected()];
  release();
  assert.deepEqual(await Promise.all(checks), [true, true, true]);
  assert.equal(calls(), 1);
});

test('a check NordVPN never answers fails closed after the timeout', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) =>
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    )) as typeof fetch;
  try {
    const guard = new VpnGuard({
      settings: () => ({ disabled: false, knownVpnIps: '' }),
      timeoutMs: 20,
    });
    // AbortSignal.timeout does not keep the process alive; a running service always is.
    const keepAlive = setInterval(() => undefined, 1000);
    const started = Date.now();
    const result = await guard.isProtected().finally(() => clearInterval(keepAlive));
    assert.equal(result, false);
    assert.ok(Date.now() - started < 1000);
    assert.equal(guard.state, 'unprotected');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('is disabled without asking NordVPN', async () => {
  const { guard, calls } = setup(() => ({ protected: false }), { disabled: true });
  assert.equal(guard.state, 'disabled');
  assert.equal(await guard.isProtected(), true);
  assert.equal(calls(), 0);
});

test('a check with draft settings does not change the live state', async () => {
  const { guard } = setup(() => ({ protected: false, ip: '9.9.9.9' }));
  assert.equal(
    await guard.isProtected(undefined, { disabled: false, knownVpnIps: '9.9.9.9' }),
    true
  );
  assert.equal(guard.state, 'unprotected');
});

test('watch reports state changes', async () => {
  let answer = { protected: true };
  const { guard, advance } = setup(() => answer);
  const states: string[] = [];
  const stop = guard.watch(state => states.push(state), 10);
  assert.deepEqual(states, []);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(states, ['protected']);
  answer = { protected: false };
  advance(300_000);
  await new Promise(resolve => setTimeout(resolve, 30));
  stop();
  assert.deepEqual(states, ['protected', 'unprotected']);
});

test('names the settings after the service', () => {
  assert.deepEqual(
    vpnConfigVariables('MEDIA_LOAD').map(variable => variable.key),
    ['MEDIA_LOAD_DISABLE_VPN_CHECK', 'MEDIA_LOAD_KNOWN_VPN_IPS']
  );
  const values: Record<string, string> = { SOURCES_DISABLE_VPN_CHECK: 'true' };
  assert.deepEqual(
    vpnSettingsFrom('SOURCES', key => values[key]),
    { disabled: true, knownVpnIps: '' }
  );
});
