import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'bun:test';

import { HttpClient } from '../src/http/http-client';
import { parseDefinition } from '../src/providers/cardigann/definition';
import { CardigannProvider } from '../src/providers/cardigann/engine';
import { UnsupportedFeature } from '../src/providers/cardigann/errors';
import {
  applyFilter,
  parseAnyDate,
  parseGoDate,
  parseSize,
  parseTimeAgo,
} from '../src/providers/cardigann/filters';
import { renderTemplate } from '../src/providers/cardigann/template';
import { torrentInfoHash } from '../src/util/bencode';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, 'fixtures/cardigann', name), 'utf8');
const NOW = Date.parse('2026-08-02T12:00:00Z');
const filterContext = { now: () => NOW, keywords: 'example movie' };
const client = (handler: (url: URL, init: RequestInit) => Response | Promise<Response>) =>
  new HttpClient({ timeout: () => 2000, flareSolverr: () => '' }, ((
    input: URL | string | Request,
    init?: RequestInit
  ) => handler(new URL(String(input)), init ?? {})) as typeof fetch);
const context = (http: HttpClient) => ({ http, signal: new AbortController().signal });
const provider = (file: string, settings: Record<string, string | boolean> = {}) => {
  const definition = parseDefinition(fixture(file));
  return new CardigannProvider(
    `test-${definition.id}`,
    definition.name,
    definition,
    settings,
    () => NOW
  );
};
const hash = (letter: string) => letter.repeat(40);

/* template ------------------------------------------------------------------------------- */
const vars = {
  Keywords: 'big movie',
  Query: { IMDBID: 'tt123', IMDBIDShort: '123', Season: 2, Ep: '', Type: 'movie' },
  Categories: ['2000', '2010'],
  Config: { sort: 'seeders', flag: false },
  Result: { title: 'Name' },
  Today: { Year: 2026 },
  True: 'True',
  False: null,
};
it('renders variables, conditionals, ranges and functions', () => {
  const render = (template: string) => renderTemplate(template, vars);
  expect(render('q={{ .Keywords }}&i={{ .Query.IMDBIDShort }}')).toBe('q=big movie&i=123');
  expect(
    render('{{ if .Query.Ep }}ep{{ else if .Query.Season }}season{{ else }}none{{ end }}')
  ).toBe('season');
  expect(render('{{ if .Config.flag }}yes{{ else }}no{{ end }}')).toBe('no');
  expect(render('{{ range .Categories }}c{{ . }};{{ end }}')).toBe('c2000;c2010;');
  expect(render('{{ join .Categories "," }}')).toBe('2000,2010');
  expect(render('{{ or .Query.Ep .Query.Season }}')).toBe('2');
  expect(render('{{ if and .Query.IMDBID .Query.Season }}both{{ end }}')).toBe('both');
  expect(
    render('{{ if eq .Query.Type "movie" }}m{{ end }}{{ if ne .Query.Type "movie" }}x{{ end }}')
  ).toBe('m');
  expect(render('{{ if not .Query.Ep }}empty{{ end }}')).toBe('empty');
  expect(render('{{ re_replace .Keywords "[aeiou]" "_" }}')).toBe('b_g m_v__');
  expect(render('{{ if eq .Config.sort "seeders" }}{{ .Today.Year }}{{ end }}')).toBe('2026');
  expect(render('{{ if .Config.sort }}{{ .Result.title }}{{ end }}')).toBe('Name');
  expect(render('a {{- " b" -}}   c')).toBe('a bc');
  expect(render('{{ if or (eq .Query.Type "x") (eq .Query.Type "movie") }}ok{{ end }}')).toBe('ok');
  expect(render('{{ .Missing.Value }}|{{ if .True }}t{{ end }}{{ if .False }}f{{ end }}')).toBe(
    '|t'
  );
  expect(render('no template')).toBe('no template');
});
it('rejects template features outside the subset', () => {
  for (const template of [
    '{{ with .X }}a{{ end }}',
    '{{ $x := 1 }}',
    '{{ nosuch .X }}',
    '{{ if .X }}a',
  ])
    expect(() => renderTemplate(template, vars)).toThrow(UnsupportedFeature);
});

/* filters -------------------------------------------------------------------------------- */
it('applies text filters', () => {
  const apply = (value: string, name: string, args?: unknown) =>
    applyFilter(value, { name, args }, filterContext);
  expect(apply('a-b-c', 'replace', ['-', '+'])).toBe('a+b+c');
  expect(apply('x  y   z', 're_replace', ['\\s+', ' '])).toBe('x y z');
  expect(apply('Size: 1.5 GB (x)', 'regexp', 'Size: ([\\d.]+)')).toBe('1.5');
  expect(apply('nomatch', 'regexp', '(\\d+)')).toBe('');
  expect(apply('a|b|c', 'split', ['|', 1])).toBe('b');
  expect(apply('a|b|c', 'split', ['|', -1])).toBe('c');
  expect(apply('--x--', 'trim', '-')).toBe('x');
  expect(apply('  x ', 'trim')).toBe('x');
  expect(apply('x', 'append', '!')).toBe('x!');
  expect(apply('x', 'prepend', '!')).toBe('!x');
  expect(apply('MiXed', 'tolower')).toBe('mixed');
  expect(apply('MiXed', 'toupper')).toBe('MIXED');
  expect(apply('a b&c', 'urlencode')).toBe('a%20b%26c');
  expect(apply('a%20b+c', 'urldecode')).toBe('a b c');
  expect(apply('Tom &amp; Jerry &#39;s &lt;b&gt;', 'htmldecode')).toBe("Tom & Jerry 's <b>");
  expect(apply('magnet:?xt=urn:btih:abc&dn=Name', 'querystring', 'dn')).toBe('Name');
  expect(apply('Café Déjà', 'diacritics', 'replace')).toBe('Cafe Deja');
  expect(apply('a/b:c', 'validfilename')).toBe('abc');
  expect(apply('keep', 'strdump')).toBe('keep');
  expect(apply('Movies', 'validate', 'movies, tv')).toBe('Movies');
  expect(apply('Music', 'validate', 'movies, tv')).toBe('');
  expect(apply('Example Movie 2020', 'andmatch')).toBe('Example Movie 2020');
  expect(apply('Other Thing', 'andmatch')).toBe('');
  expect(() => apply('x', 'hexdump')).toThrow(UnsupportedFeature);
});
it('parses Go date layouts, relative times and sizes', () => {
  expect(parseGoDate('2026-08-01 10:30:15', '2006-01-02 15:04:05')?.toISOString()).toBe(
    '2026-08-01T10:30:15.000Z'
  );
  expect(parseGoDate('Aug 3, 2026 4:05 PM', 'Jan 2, 2006 3:04 PM')?.toISOString()).toBe(
    '2026-08-03T16:05:00.000Z'
  );
  expect(
    parseGoDate('Sat, 01 Aug 2026 10:00:00 -0200', 'Mon, 02 Jan 2006 15:04:05 -0700')?.toISOString()
  ).toBe('2026-08-01T12:00:00.000Z');
  expect(parseGoDate('02/08/26', '02/01/06')?.toISOString()).toBe('2026-08-02T00:00:00.000Z');
  expect(parseGoDate('2026-08-01T10:00:00Z', '2006-01-02T15:04:05Z07:00')?.toISOString()).toBe(
    '2026-08-01T10:00:00.000Z'
  );
  expect(parseGoDate('garbage', '2006-01-02')).toBeNull();
  expect(parseTimeAgo('3 hours ago', NOW)?.toISOString()).toBe('2026-08-02T09:00:00.000Z');
  expect(parseTimeAgo('1 day 2 hours ago', NOW)?.toISOString()).toBe('2026-08-01T10:00:00.000Z');
  expect(parseTimeAgo('an hour ago', NOW)?.toISOString()).toBe('2026-08-02T11:00:00.000Z');
  expect(parseTimeAgo('tomorrow', NOW)).toBeNull();
  expect(applyFilter('Yesterday 10:30', { name: 'fuzzytime' }, filterContext)).toBe(
    '2026-08-01T10:30:00.000Z'
  );
  expect(applyFilter('5 minutes ago', { name: 'fuzzytime' }, filterContext)).toBe(
    '2026-08-02T11:55:00.000Z'
  );
  expect(parseSize('1.5 GB')).toBe(1610612736);
  expect(parseSize('700 MiB')).toBe(734003200);
  expect(parseSize('1,5 GB')).toBe(1610612736);
  expect(parseSize('1,234.5 KB')).toBe(1264128);
  // A bare number is a count of bytes, as JSON APIs give them.
  expect(parseSize('890199081')).toBe(890199081);
  expect(parseSize('0')).toBe(0);
  expect(parseSize('n/a')).toBeNull();
});

/* definitions ---------------------------------------------------------------------------- */
it('flags unsupported definitions instead of crashing', () => {
  expect(() => parseDefinition(fixture('private-tracker.yml'))).toThrow(UnsupportedFeature);
  expect(() => parseDefinition(fixture('unsupported-filter.yml'))).toThrow('hexdump');
  expect(() => parseDefinition('id: [unclosed')).toThrow('not valid YAML');
  expect(() => parseDefinition('id: nothing\nname: x\ntype: public\n')).toThrow(
    'Invalid definition'
  );
  expect(() =>
    parseDefinition(
      fixture('json-api.yml').replace('type: public', 'type: public\nlogin:\n  path: /login')
    )
  ).toThrow();
  expect(parseDefinition(fixture('json-api.yml')).id).toBe('jsonapi');
});
it('derives capabilities, categories and rate from the definition', () => {
  const json = provider('json-api.yml');
  expect(json.caps.movie).toEqual(['q', 'imdbid', 'page']);
  expect(json.caps.tv).toEqual(['q', 'season', 'ep', 'page']);
  expect(json.rate.minIntervalMs).toBe(2000);
  expect(json.maxPages).toBe(3);
  expect(json.settingsSchema).toEqual([
    {
      name: 'sort',
      type: 'select',
      label: 'Sort by',
      default: 'seeders',
      options: { seeders: 'Seeders', date: 'Date' },
    },
  ]);
  const table = provider('html-table.yml');
  expect(table.caps.movie).toEqual([]);
  expect(table.caps.tv).toEqual(['q', 'season', 'ep']);
  expect(table.caps.anime).toEqual(['q']);
  expect(table.maxPages).toBe(1);
});

/* engine --------------------------------------------------------------------------------- */
it('runs a JSON API definition with templated paths, inputs, filters and link rotation', async () => {
  const urls: string[] = [];
  const http = client(url => {
    urls.push(url.href);
    if (url.host === 'jsonapi.invalid') throw new TypeError('connection refused');
    return Response.json({
      results: [
        {
          n: 'Example.Movie.2020.1080p.BluRay.x264-GRP',
          h: hash('A'),
          s: '2.5 GB',
          se: '1,200',
          le: 30,
          a: '2026-08-01 10:30:15',
          c: '1',
        },
        { n: 'No.Hash.Release', s: '1 GB', se: 1 },
      ],
    });
  });
  const json = provider('json-api.yml', { sort: 'date' });
  const byId = await json.search({ kind: 'movie', imdbid: 'tt1234567', page: 2 }, context(http));
  expect(urls[1]).toBe(
    'https://backup.jsonapi.invalid/api/imdb/tt1234567/?format=json&order=date&page=2'
  );
  expect(byId.results).toHaveLength(1);
  expect(byId.results[0]).toMatchObject({
    title: 'Example.Movie.2020.1080p.BluRay.x264-GRP',
    hash: hash('a'),
    size: 2684354560,
    seeders: 1200,
    leechers: 30,
    date: '2026-08-01T10:30:15.000Z',
    category: 'Movies',
  });
  expect(byId.hasMore).toBe(true);
  urls.length = 0;
  await json.search({ kind: 'movie', q: "Big: Movie's Night!" }, context(http));
  // The working mirror is remembered, and keyword filters clean the query.
  expect(urls).toEqual([
    'https://backup.jsonapi.invalid/api/posts/Big%20Movie%20s%20Night/?format=json&order=date&page=1',
  ]);
});
it('reads nested rows with parent access', async () => {
  const http = client(url => {
    expect(url.href).toBe('https://nested.invalid/api/list?query_term=tt0111111');
    return Response.json({
      data: {
        movies: [
          {
            title: 'Example',
            year: 2020,
            imdb_code: 'tt0111111',
            torrents: [
              {
                quality: '720p',
                hash: hash('B').toUpperCase(),
                size_bytes: 1000,
                seeds: 5,
                peers: 9,
              },
              { quality: '1080p', hash: hash('C'), size_bytes: 2000, seeds: 50, peers: 60 },
            ],
          },
          { title: 'No torrents', year: 2021, imdb_code: 'tt0222222' },
        ],
      },
    });
  });
  const page = await provider('nested-json.yml').search(
    { kind: 'movie', imdbid: 'tt0111111' },
    context(http)
  );
  expect(page.results.map(r => [r.title, r.hash, r.seeders, r.imdbid])).toEqual([
    ['Example (2020) [720p]', hash('b'), 5, 'tt0111111'],
    ['Example (2020) [1080p]', hash('c'), 50, 'tt0111111'],
  ]);
});
const TABLE = `<html><body><table class="results">
  <tr class="row"><td class="name"><a href="/t/1">Example Show S01E02 1080p</a><span class="badge">VIP</span></td>
    <td><a class="magnet" href="magnet:?xt=urn:btih:${hash('d')}&dn=Example">m</a></td>
    <td class="size">1.2 GB</td><td class="seeds">42</td><td class="leech">7</td><td class="age">2 hours ago</td></tr>
  <tr class="row"><td class="name"><a href="/t/2">Other Release S01E02</a></td>
    <td><a class="magnet" href="magnet:?xt=urn:btih:${hash('e')}">m</a></td>
    <td class="size">300 MB</td><td class="seeds">3</td><td class="age">1 day ago</td></tr>
  <tr class="row"><td class="name"><a href="/t/3">Broken row</a></td></tr>
</table></body></html>`;
it('reads an HTML table with magnets, optional fields and relative dates', async () => {
  const http = client(url => {
    expect(url.href).toBe('https://table.invalid/search/Example%20Show%20S01E02');
    return new Response(TABLE);
  });
  const page = await provider('html-table.yml').search(
    { kind: 'tv', q: 'Example Show S01E02' },
    context(http)
  );
  expect(page.results).toHaveLength(2);
  expect(page.results[0]).toMatchObject({
    title: 'Example Show S01E02 1080p',
    size: 1288490189,
    seeders: 42,
    leechers: 7,
    date: '2026-08-02T10:00:00.000Z',
    category: 'TV',
  });
  expect(page.results[0].magnet).toContain(hash('d'));
  expect(page.results[1].leechers).toBeUndefined();
});
const torrentBytes = () =>
  Buffer.concat([
    Buffer.from(
      'd8:announce22:http://tracker.invalid4:infod6:lengthi5e4:name1:a12:piece lengthi16384e6:pieces20:'
    ),
    Buffer.alloc(20, 7),
    Buffer.from('ee'),
  ]);
/** The info dictionary runs from its key's value to the final "e" of the outer dictionary. */
const torrentHash = () => {
  const bytes = torrentBytes();
  return createHash('sha1')
    .update(bytes.subarray(bytes.indexOf('d6:length'), bytes.length - 1))
    .digest('hex');
};
it('computes info-hashes from .torrent files', () => {
  expect(torrentInfoHash(new Uint8Array(torrentBytes()))).toBe(torrentHash());
  expect(torrentInfoHash(Buffer.from('not a torrent'))).toBeNull();
  expect(torrentInfoHash(Buffer.from('d4:infod6:lengthi5ee'.slice(0, 12)))).toBeNull();
  expect(torrentInfoHash(Buffer.from('d3:fooi1ee'))).toBeNull();
});
it('resolves hashes from details pages and .torrent files, within a request limit', async () => {
  const items = Array.from(
    { length: 12 },
    (_, i) =>
      `<div class="item"><a class="title" href="/d/${i}">Movie ${i}</a><span class="seeds">${i}</span><span class="size">1 GB</span></div>`
  ).join('');
  const calls: string[] = [];
  const http = client(url => {
    calls.push(url.pathname);
    if (url.pathname === '/find') return new Response(`<html><body>${items}</body></html>`);
    if (url.pathname.startsWith('/d/'))
      return new Response(
        `<html><body><a class="dl" href="${
          url.pathname === '/d/11'
            ? `magnet:?xt=urn:btih:${hash('f')}`
            : `/file${url.pathname}.torrent`
        }">dl</a></body></html>`
      );
    return new Response(url.pathname === '/file/d/10.torrent' ? torrentBytes() : 'not found', {
      status: url.pathname === '/file/d/10.torrent' ? 200 : 404,
    });
  });
  const page = await provider('html-details.yml').search(
    { kind: 'movie', q: 'movie' },
    context(http)
  );
  const detailRequests = calls.filter(path => path.startsWith('/d/'));
  // Only the 8 best-seeded rows are resolved; /d/11 gives a magnet, /d/10 a hashable torrent.
  expect(detailRequests).toHaveLength(8);
  expect(page.results.map(r => r.title).sort()).toEqual(['Movie 10', 'Movie 11']);
  expect(page.results.find(r => r.title === 'Movie 11')?.magnet).toContain(hash('f'));
  expect(page.results.find(r => r.title === 'Movie 10')?.hash).toBe(torrentHash());
});
it('reports test results and request failures', async () => {
  const ok = client(() => Response.json({ results: [] }));
  expect(await provider('json-api.yml').test(context(ok))).toMatchObject({ success: true });
  const down = client(() => new Response('no', { status: 500 }));
  const result = await provider('json-api.yml').test(context(down));
  expect(result.success).toBe(false);
  expect(result.message).toContain('500');
});

it('tests anime-only providers with a search they support', async () => {
  const urls: string[] = [];
  const http = client(url => {
    urls.push(url.pathname + url.search);
    return Response.json([]);
  });
  expect(await provider('anime-ids.yml').test(context(http))).toMatchObject({ success: true });
  // Without text search, a known AniDB anime id is the sample.
  const idOnly = parseDefinition(
    fixture('anime-ids.yml')
      .replace('search: [q]', 'search: []')
      .replace('anime-search: [q, anidbeid, anidbaid]', 'anime-search: [anidbaid]')
  );
  const idProvider = new CardigannProvider('test-ids', 'Ids', idOnly, {}, () => NOW);
  expect(await idProvider.test(context(http))).toMatchObject({ success: true });
  expect(urls).toEqual(['/json?q=test', '/json?aid=23']);
});

it('reads Unix timestamps in seconds or milliseconds as dates', () => {
  expect(parseAnyDate('1790402106')?.toISOString()).toBe('2026-09-26T05:55:06.000Z');
  expect(parseAnyDate('1790402106000')?.toISOString()).toBe('2026-09-26T05:55:06.000Z');
  expect(parseAnyDate('2026-08-01')?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  expect(parseAnyDate('12345')).not.toBeNull();
  expect(parseAnyDate('nonsense')).toBeNull();
});
it('keeps only rows whose title has every keyword when the definition asks for andmatch', async () => {
  const yaml = fixture('json-api.yml').replace(
    '  rows:\n    selector: results',
    '  rows:\n    selector: results\n    filters:\n      - name: andmatch'
  );
  const definition = parseDefinition(yaml);
  const json = new CardigannProvider('x', 'x', definition, {}, () => NOW);
  const http = client(() =>
    Response.json({
      results: [
        { n: 'Example Show S01E01 1080p', h: hash('a'), se: 5 },
        { n: 'Example Show S01E02 1080p', h: hash('b'), se: 9 },
        { n: 'Unrelated S01E01', h: hash('c'), se: 1 },
      ],
    })
  );
  const page = await json.search({ kind: 'tv', q: 'Example Show S01E01' }, context(http));
  expect(page.results.map(r => r.title)).toEqual(['Example Show S01E01 1080p']);
});
it('passes Retry-After on so a rate-limited site pauses the provider', async () => {
  const http = client(
    () => new Response('slow down', { status: 429, headers: { 'retry-after': '120' } })
  );
  const error = await provider('json-api.yml')
    .search({ kind: 'movie', q: 'x' }, context(http))
    .catch(e => e);
  expect(error).toMatchObject({ status: 429, retryAfter: '120' });
});

it('offers text search only when the definition lists it', () => {
  const yaml = fixture('json-api.yml')
    .replace('tv-search: [q, season, ep]', 'tv-search: [imdbid, season, ep]')
    .replace('movie-search: [q, imdbid]', 'movie-search: [imdbid]');
  const definition = parseDefinition(yaml);
  const idOnly = new CardigannProvider('x', 'x', definition);
  expect(idOnly.caps.movie).toEqual(['imdbid', 'page']);
  expect(idOnly.caps.tv).toEqual(['imdbid', 'season', 'ep', 'page']);
  // A mode that is not declared falls back to plain search.
  const fallback = parseDefinition(yaml.replace('    movie-search: [imdbid]\n', ''));
  expect(new CardigannProvider('x', 'x', fallback).caps.movie).toEqual(['q', 'page']);
});

it('reads Go and .NET style regular expressions', () => {
  const apply = (value: string, name: string, args: unknown) =>
    applyFilter(value, { name, args }, filterContext);
  // Inline flags: `(?i)` is not JavaScript syntax.
  expect(apply('Show [EZTVx.to].mkv', 're_replace', ['(?i)\\[eztvx?\\.[a-z]+\\]', ''])).toBe(
    'Show .mkv'
  );
  expect(apply('ABC', 'regexp', ['(?i)(b)'])).toBe('B');
  expect(apply('a\nb', 'regexp', ['(?s)(a.b)'])).toBe('a\nb');
  expect(apply('x1y', 'regexp', ['(?P<digit>\\d)'])).toBe('1');
  expect(renderTemplate('{{ re_replace .Keywords "(?i)BIG" "small" }}', vars)).toBe('small movie');
});

const apiDefinition = (extra: string) => `---
id: variants
name: Variants
type: public
links:
  - https://variants.invalid/
caps:
${extra}
  modes:
    search: [q]
    movie-search: [q, imdbid]
search:
  paths:
    - path: find
      response:
        type: json
  rows:
    selector: $.data.items
  fields:
    title:
      selector: $.name
    infohash:
      selector: $.hash
`;
it('accepts the short caps.categories form, JSONPath roots and non-CSS JSON selectors', async () => {
  const definition = parseDefinition(
    apiDefinition('  categories:\n    Movies: Movies\n    TV: TV')
  );
  const provider = new CardigannProvider('variants', 'Variants', definition, {}, () => NOW);
  expect(provider.caps.movie).toEqual(['q', 'imdbid']);
  expect(provider.caps.tv).toEqual(['q']);
  const http = client(() =>
    Response.json({
      data: { items: [{ name: 'Example Movie 2020', hash: hash('a') }, { name: 'No hash' }] },
    })
  );
  const page = await provider.search({ kind: 'movie', q: 'Example' }, context(http));
  expect(page.results.map(r => [r.title, r.hash])).toEqual([['Example Movie 2020', hash('a')]]);
});
it('reads namespaced XML selectors', async () => {
  const yaml = `---
id: feed
name: Feed
type: public
links:
  - https://feed.invalid/
caps:
  modes:
    search: [q]
search:
  paths:
    - path: rss
      response:
        type: xml
  rows:
    selector: item
  fields:
    title:
      selector: title
    infohash:
      selector: torznab|attr[name=infohash]
      attribute: value
`;
  const provider = new CardigannProvider('feed', 'Feed', parseDefinition(yaml), {}, () => NOW);
  const body = `<rss xmlns:torznab="http://torznab.com/schemas/2015/feed"><channel>
    <item><title>One</title><torznab:attr name="infohash" value="${hash('b')}"/></item>
    <item><title>Two</title></item></channel></rss>`;
  const page = await provider.search(
    { kind: 'movie', q: 'x' },
    context(client(() => new Response(body)))
  );
  expect(page.results.map(r => [r.title, r.hash])).toEqual([['One', hash('b')]]);
});
