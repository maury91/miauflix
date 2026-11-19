import { afterEach, describe, expect, it, vi } from 'vitest';

const proto = String.prototype as unknown as Record<string, unknown>;
const native = proto['matchAll'];

describe('legacy matchAll', () => {
  afterEach(() => {
    proto['matchAll'] = native;
  });

  it('steps over a whole code point after an empty unicode match', async () => {
    delete proto['matchAll'];
    vi.resetModules();
    await import('./legacy');

    const matches = [...'😀a'.matchAll(/(?:)/gu)].map(match => match.index);

    expect(matches).toEqual([0, 2, 3]);
  });
});
