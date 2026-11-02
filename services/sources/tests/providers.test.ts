import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'bun:test';

import { SourcesConfigService } from '../src/config/config.service';
import { HttpClient } from '../src/http/http-client';
import { toCandidate } from '../src/normalize/candidate';
import { TherarbgProvider } from '../src/providers/native/therarbg';
import { YtsProvider } from '../src/providers/native/yts';

const fixture = (path: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, 'fixtures/recorded', path), 'utf8')) as {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  };
const setup = (data: { status: number; headers: Record<string, string>; body: unknown }) => {
  const config = new SourcesConfigService();
  const http = new HttpClient(
    { timeout: () => 1000, flareSolverr: () => '' },
    (async () =>
      new Response(typeof data.body === 'string' ? data.body : JSON.stringify(data.body), {
        status: data.status,
        headers: data.headers,
      })) as unknown as typeof fetch
  );
  return { config, ctx: { http, signal: new AbortController().signal } };
};
it('parses sanitized recorded TheRARBG detail and keyword response formats', async () => {
  for (const path of [
    'therarbg/imdb-detail/tt0119698/?format=json.json',
    'therarbg/get-posts/keywords:tt0119698:ncategory:XXX?format=json.json',
  ]) {
    const data = fixture(path),
      { config, ctx } = setup(data);
    const provider = new TherarbgProvider(config);
    const page = await provider.search({ kind: 'movie', imdbid: 'tt0119698' }, ctx);
    expect(page.results.length).toBeGreaterThan(0);
    for (const raw of page.results) {
      expect(raw.title.length).toBeGreaterThan(0);
      expect(raw.hash).toMatch(/^[a-f0-9]{40}$/i);
      expect(raw.size).toBeGreaterThan(0);
    }
  }
});
it('normalizes recorded YTS source metadata and preserves trailer/runtime information', async () => {
  const data = fixture('yts/api/v2/list_movies.json?query_term=tt29623480&page=1&limit=20.json');
  const { config, ctx } = setup(data);
  const provider = new YtsProvider(config),
    page = await provider.search({ kind: 'movie', imdbid: 'tt29623480' }, ctx);
  expect(page.results.length).toBeGreaterThan(0);
  const raw = page.results[0],
    candidate = toCandidate(
      raw,
      provider,
      'imdb',
      { kind: 'movie', imdbid: raw.imdbid },
      {
        media: { kind: 'movie', title: raw.title, tmdbId: 1, imdbId: raw.imdbid ?? null },
        purpose: 'interactive',
      },
      value => value
    );
  expect(candidate).toMatchObject({
    provider: 'yts',
    accuracy: 'high',
    trailerCode: 'fUdfyhwge7R',
  });
  expect(candidate?.bitrate).toBeGreaterThan(0);
  expect(candidate?.quality).not.toBeNull();
  expect(candidate?.fileRef).toContain('url');
});
it('treats a TheRARBG homepage redirect as an empty answer', async () => {
  const { config, ctx } = setup({ status: 302, headers: { location: '/' }, body: '' });
  expect(
    await new TherarbgProvider(config).search({ kind: 'tv', imdbid: 'tt1234567' }, ctx)
  ).toEqual({ results: [], hasMore: false });
});
