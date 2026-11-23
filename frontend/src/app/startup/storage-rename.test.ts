import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function runMigration() {
  vi.resetModules();
  await import('./storage-rename');
}

describe('storage-rename', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('moves the keys saved before the rename to Miauwatch', async () => {
    localStorage.setItem('miauflix.tv.refreshTokens', '{"s1":"token"}');
    localStorage.setItem('miauflix:trakt:dont-ask:user-1', '1');
    sessionStorage.setItem('miauflix:trakt:not-now:session', '1');

    await runMigration();

    expect(localStorage.getItem('miauwatch.tv.refreshTokens')).toBe('{"s1":"token"}');
    expect(localStorage.getItem('miauwatch:trakt:dont-ask:user-1')).toBe('1');
    expect(sessionStorage.getItem('miauwatch:trakt:not-now:session')).toBe('1');
    expect(localStorage.getItem('miauflix.tv.refreshTokens')).toBeNull();
    expect(localStorage.getItem('miauflix:trakt:dont-ask:user-1')).toBeNull();
    expect(sessionStorage.getItem('miauflix:trakt:not-now:session')).toBeNull();
  });

  it('keeps a value already saved under the new key', async () => {
    localStorage.setItem('miauflix.tv.server', 'http://old.example');
    localStorage.setItem('miauwatch.tv.server', 'http://new.example');

    await runMigration();

    expect(localStorage.getItem('miauwatch.tv.server')).toBe('http://new.example');
    expect(localStorage.getItem('miauflix.tv.server')).toBeNull();
  });

  it('leaves unrelated keys alone', async () => {
    localStorage.setItem('miauflixish', 'x');
    localStorage.setItem('other', 'y');

    await runMigration();

    expect(localStorage.getItem('miauflixish')).toBe('x');
    expect(localStorage.getItem('other')).toBe('y');
  });
});
