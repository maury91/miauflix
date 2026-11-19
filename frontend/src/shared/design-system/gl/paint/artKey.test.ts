import { describe, expect, it } from 'vitest';

import { artKey } from './artKey';

describe('artKey', () => {
  it('is the same for the same props in any order', () => {
    expect(artKey('tile', { a: 1, b: 'x' })).toBe(artKey('tile', { b: 'x', a: 1 }));
  });

  it('changes with any prop and with the name', () => {
    const key = artKey('tile', { label: 'Dune', progress: 0.5 });
    expect(artKey('tile', { label: 'Dune', progress: 0.6 })).not.toBe(key);
    expect(artKey('tile', { label: 'Dune 2', progress: 0.5 })).not.toBe(key);
    expect(artKey('media', { label: 'Dune', progress: 0.5 })).not.toBe(key);
  });

  it('treats undefined as absent, but not null or empty', () => {
    expect(artKey('tile', { a: 1, b: undefined })).toBe(artKey('tile', { a: 1 }));
    expect(artKey('tile', { a: 1, b: null })).not.toBe(artKey('tile', { a: 1 }));
    expect(artKey('tile', { a: '' })).not.toBe(artKey('tile', {}));
  });

  it("can't be confused by separators in values", () => {
    expect(artKey('t', { a: 'x,b=1' })).not.toBe(artKey('t', { a: 'x', b: 1 }));
  });
});
