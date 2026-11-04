import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CONTROL_PATH } from './protocol.js';
import { connect } from './remote.js';

for (const [name, suffix] of [
  ['no trailing slash', ''],
  ['trailing slashes', '/'.repeat(100_000)],
  ['non-trailing slashes', `${'/'.repeat(100_000)}x`],
] as const) {
  test(`remote URLs preserve semantics with ${name}`, { timeout: 2_000 }, () => {
    const sockets: string[] = [];
    class Socket {
      constructor(url: string) {
        sockets.push(url);
      }
      close() {}
    }
    const base = 'https://example.com';
    const connection = connect({
      url: () => `${base}${suffix}`,
      ticketKey: 'test-key',
      WebSocket: Socket as unknown as typeof WebSocket,
    });
    try {
      assert.equal(sockets.length, 1);
      assert.equal(sockets[0], `wss://example.com${CONTROL_PATH}`);
      const expectedBase = suffix.endsWith('x') ? `${base}${suffix}` : base;
      assert.ok(connection.transport.bytesUrl('file', {}).startsWith(`${expectedBase}/_b/`));
    } finally {
      connection.close();
    }
  });
}
