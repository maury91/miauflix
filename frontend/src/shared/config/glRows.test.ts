import { describe, expect, it } from 'vitest';

import { resolveGlRows } from './constants';

const tizen = { tizen: true, glRows: true, dev: false, override: null };
const web = { tizen: false, glRows: true, dev: false, override: null };

describe('resolveGlRows', () => {
  it('draws the rows with GL on the Tizen build, the DOM on the web', () => {
    expect(resolveGlRows(tizen)).toBe(true);
    expect(resolveGlRows(web)).toBe(false);
  });

  it('keeps a Tizen build packaged without GL on the DOM', () => {
    expect(resolveGlRows({ ...tizen, glRows: false })).toBe(false);
  });

  it("forces the DOM rows with '0' on any build", () => {
    expect(resolveGlRows({ ...tizen, override: '0' })).toBe(false);
    expect(resolveGlRows({ ...web, dev: true, override: '0' })).toBe(false);
  });

  it("turns GL on with '1' on a Tizen build without it, or in development only", () => {
    expect(resolveGlRows({ ...tizen, glRows: false, override: '1' })).toBe(true);
    expect(resolveGlRows({ ...web, dev: true, override: '1' })).toBe(true);
    expect(resolveGlRows({ ...web, override: '1' })).toBe(false);
  });

  it('ignores other stored values', () => {
    expect(resolveGlRows({ ...tizen, override: 'off' })).toBe(true);
  });
});
