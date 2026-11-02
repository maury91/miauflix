import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'bun:test';

import { HttpClient } from '../src/http/http-client';
import { parseCaps, parseItems, TorznabProvider } from '../src/providers/torznab/torznab';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, 'fixtures/torznab', name), 'utf8');
const client = (handler: (url: URL) => Response | Promise<Response>) =>
  new HttpClient({ timeout: () => 2000, flareSolverr: () => '' }, ((
    input: URL | string | Request
  ) => handler(new URL(String(input)))) as typeof fetch);
const context = (http: HttpClient) => ({ http, signal: new AbortController().signal });
const xml = (body: string) =>
  new Response(body, { headers: { 'content-type': 'application/xml' } });

it('reads capabilities from Jackett and Prowlarr', () => {
  expect(parseCaps(fixture('jackett-caps.xml'))).toEqual({
    movie: ['q', 'imdbid', 'tmdbid'],
    tv: ['q', 'season', 'ep', 'imdbid', 'tvdbid'],
    anime: ['q'],
  });
  expect(parseCaps(fixture('prowlarr-caps.xml')).tv).toEqual([
    'q',
    'season',
    'ep',
    'imdbid',
    'tvdbid',
    'tmdbid',
  ]);
  expect(
    parseCaps('<caps><searching><search available="yes" supportedParams="q"/></searching></caps>')
  ).toEqual({
    movie: ['q'],
    tv: ['q'],
    anime: ['q'],
  });
  expect(parseCaps('<caps><searching /></caps>')).toEqual({ movie: [], tv: [], anime: [] });
});
it('parses Jackett items', () => {
  const { results, error } = parseItems(fixture('jackett-results.xml'));
  expect(error).toBeNull();
  expect(results).toHaveLength(2);
  expect(results[0]).toMatchObject({
    title: 'Example.Movie.2020.1080p.BluRay.x264-GRP',
    hash: 'a'.repeat(40),
    size: 2147483648,
    seeders: 40,
    leechers: 15,
    date: '2026-08-01T10:00:00.000Z',
    imdbid: 'tt1234567',
  });
  expect(results[0].torrentUrl).toContain('jackett.invalid/dl/example');
  expect(results[1].magnet).toContain('b'.repeat(40));
  expect(results[1].leechers).toBe(0);
  expect(results[1].size).toBe(734003200);
});
it('parses Prowlarr items and indexer errors', () => {
  const { results } = parseItems(fixture('prowlarr-results.xml'));
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ seeders: 12, leechers: 8, size: 1073741824 });
  expect(results[0].magnet).toContain('c'.repeat(40));
  expect(parseItems(fixture('error.xml'))).toEqual({
    results: [],
    error: 'Incorrect imdbid format',
  });
});
it('searches with a prefixed IMDb id, falls back to digits, and sends the API key', async () => {
  const requests: URL[] = [];
  const http = client(url => {
    requests.push(url);
    if (url.searchParams.get('t') === 'caps') return xml(fixture('jackett-caps.xml'));
    return xml(
      url.searchParams.get('imdbid')?.startsWith('tt')
        ? fixture('error.xml')
        : fixture('jackett-results.xml')
    );
  });
  const provider = new TorznabProvider(
    'torznab-test',
    'Test',
    'https://indexer.invalid/api/v2.0/indexers/all/results/torznab/',
    {
      apiKey: 'secret',
    }
  );
  await provider.prepare(context(http));
  expect(provider.caps.movie).toEqual(['q', 'imdbid', 'tmdbid']);
  const page = await provider.search({ kind: 'movie', imdbid: 'tt1234567' }, context(http));
  const searches = requests.filter(url => url.searchParams.get('t') === 'movie');
  expect(searches.map(url => url.searchParams.get('imdbid'))).toEqual(['tt1234567', '1234567']);
  expect(searches[0].searchParams.get('apikey')).toBe('secret');
  expect(searches[0].searchParams.get('cat')).toBe('2000');
  expect(page.results).toHaveLength(2);
});
it('searches TV by season and episode', async () => {
  const requests: URL[] = [];
  const http = client(url => {
    requests.push(url);
    return xml(fixture('prowlarr-results.xml'));
  });
  const provider = new TorznabProvider('torznab-test', 'Test', 'https://indexer.invalid/api');
  await provider.search({ kind: 'tv', q: 'Example Show', season: 1, ep: 2 }, context(http));
  const search = requests[0].searchParams;
  expect([
    search.get('t'),
    search.get('q'),
    search.get('season'),
    search.get('ep'),
    search.get('cat'),
  ]).toEqual(['tvsearch', 'Example Show', '1', '2', '5000']);
  expect(search.has('apikey')).toBe(false);
});
it('throws indexer errors and falls back to default capabilities', async () => {
  const provider = new TorznabProvider('torznab-test', 'Test', 'https://indexer.invalid/api');
  const broken = client(() => new Response('nope', { status: 500 }));
  await provider.prepare(context(broken));
  expect(provider.caps.tv).toContain('imdbid');
  await expect(
    provider.search({ kind: 'movie', q: 'x' }, context(client(() => xml(fixture('error.xml')))))
  ).rejects.toThrow('Incorrect imdbid format');
  expect(await provider.test(context(broken))).toMatchObject({ success: false });
  expect(
    await provider.test(context(client(() => xml(fixture('jackett-caps.xml')))))
  ).toMatchObject({
    success: true,
  });
});

it.each(['movie', 'tv'] as const)(
  'uses generic search for %s when the indexer has no native mode',
  async kind => {
    const requests: URL[] = [];
    const http = client(url => {
      requests.push(url);
      if (url.searchParams.get('t') === 'caps')
        return xml(
          '<caps><searching><search available="yes" supportedParams="q"/></searching></caps>'
        );
      return url.searchParams.get('t') === 'search'
        ? xml(fixture('prowlarr-results.xml'))
        : xml('<error code="202" description="Unsupported search mode"/>');
    });
    const provider = new TorznabProvider('generic', 'Generic', 'http://indexer/api');
    await provider.prepare(context(http));
    expect(provider.caps[kind]).toEqual(['q']);
    const q = kind === 'tv' ? 'Example Show S01E02' : 'Example Movie';
    const page = await provider.search({ kind, q }, context(http));
    expect(page.results).toHaveLength(1);
    expect(requests.at(-1)?.searchParams.get('t')).toBe('search');
    expect(requests.at(-1)?.searchParams.get('q')).toBe(q);
  }
);

it('uses each advertised native mode independently', async () => {
  const requests: URL[] = [];
  const http = client(url => {
    requests.push(url);
    return url.searchParams.get('t') === 'caps'
      ? xml(
          '<caps><searching><search available="yes" supportedParams="q"/><movie-search available="yes" supportedParams="q,imdbid"/><tv-search available="no"/></searching></caps>'
        )
      : xml(fixture('prowlarr-results.xml'));
  });
  const provider = new TorznabProvider('mixed', 'Mixed', 'http://indexer/api');
  await provider.prepare(context(http));
  await provider.search({ kind: 'movie', imdbid: 'tt1234567' }, context(http));
  await provider.search({ kind: 'tv', q: 'Show S01E02' }, context(http));
  expect(requests.map(url => url.searchParams.get('t'))).toEqual(['caps', 'movie', 'search']);
});
