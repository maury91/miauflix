import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { namesOf } from './anizip.js';

describe('namesOf', () => {
  it('drops a bracketed year from titles', () => {
    assert.deepEqual(namesOf({ titles: { 'x-jat': 'Jujutsu Kaisen (2023)' } }).titles, [
      'Jujutsu Kaisen',
    ]);
  });

  it('stays fast on long runs of whitespace', () => {
    const started = performance.now();
    namesOf({ titles: { en: `Show${'\t'.repeat(50_000)}x` } });
    assert.ok(performance.now() - started < 200);
  });
});
