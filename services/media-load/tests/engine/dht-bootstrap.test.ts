import { beforeEach, describe, expect, it, jest, mock } from 'bun:test';

const resolve4 = jest.fn<(host: string) => Promise<string[]>>();
mock.module('node:dns/promises', () => ({ resolve4 }));

const { resolveDhtBootstrap } = await import('../../src/engine/dht-bootstrap');

describe('resolveDhtBootstrap', () => {
  beforeEach(() => resolve4.mockReset());

  it('expands each router to every IPv4 address, keeping its port', async () => {
    resolve4.mockImplementation(async host =>
      host === 'a.example' ? ['1.1.1.1', '1.1.1.2'] : ['2.2.2.2', '1.1.1.1']
    );
    expect(await resolveDhtBootstrap(['a.example:6881', 'b.example:25401'])).toEqual([
      '1.1.1.1:6881',
      '1.1.1.2:6881',
      '2.2.2.2:25401',
      '1.1.1.1:25401',
    ]);
  });

  it('drops a router that does not resolve', async () => {
    resolve4.mockImplementation(async host => {
      if (host === 'gone.example') throw new Error('ENOTFOUND');
      return ['3.3.3.3'];
    });
    expect(await resolveDhtBootstrap(['gone.example:6881', 'ok.example:6881'])).toEqual([
      '3.3.3.3:6881',
    ]);
  });

  it('falls back to the hostnames when nothing resolves', async () => {
    resolve4.mockRejectedValue(new Error('EAI_AGAIN'));
    expect(await resolveDhtBootstrap(['a.example:6881'])).toEqual(['a.example:6881']);
  });

  it('falls back to the hostnames when DNS is too slow', async () => {
    resolve4.mockImplementation(() => new Promise(() => undefined));
    expect(await resolveDhtBootstrap(['a.example:6881'], 10)).toEqual(['a.example:6881']);
  });

  it('keeps deduplicated addresses from routers that resolved before the deadline', async () => {
    resolve4.mockImplementation(host =>
      host === 'slow.example'
        ? new Promise(() => undefined)
        : Promise.resolve(['1.1.1.1', '1.1.1.1'])
    );
    expect(await resolveDhtBootstrap(['slow.example:6881', 'fast.example:6881'], 10)).toEqual([
      '1.1.1.1:6881',
    ]);
  });
});
