jest.mock('parse-torrent');

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import parseTorrent from 'parse-torrent';

import { SubtitlesService } from './subtitles.service';

const video = 'Movie.Title.2026.1080p.WEB-DL.H264-GROUP.mkv';
const entry = (fileId: number, release: string, extra = {}) => ({
  attributes: {
    language: 'en',
    release,
    files: [{ file_id: fileId, file_name: release + '.srt' }],
    feature_details: { imdb_id: '123' },
    ...extra,
  },
});
const setupTest = (directory: string) => {
  const grant = {
    sourceId: 9,
    userId: 'user',
    playableKey: 'm:123',
    playableKind: 'movie',
    expiresAt: new Date(Date.now() + 60_000),
  };
  const verify = jest.fn().mockResolvedValue(grant);
  const source = { id: 9, movieId: 12, file: Buffer.from('mock torrent') };
  const request = jest.fn();
  const config = { get: () => 'fixture-key', getOrThrow: () => directory };
  const service = new SubtitlesService(
    config as never,
    { request } as never,
    { verify } as never,
    { getSourceById: async () => source } as never,
    { getMovieById: async () => ({ mediaId: 123, imdbId: 'tt123' }) } as never
  );
  const search = (results: unknown[]) => {
    request.mockResolvedValueOnce({ ok: true, body: { data: results } });
    return service.search('streaming-key', 'user', 'en', false, true);
  };
  return { service, request, verify, source, search };
};

describe('subtitle ranking and durable downloads', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'miauflix-subtitle-test-'));
    jest.mocked(parseTorrent).mockResolvedValue({
      files: [
        { name: 'sample.mkv', length: 1 },
        { name: video, length: 1000 },
        { name: 'extra.txt', length: 2000 },
      ],
    } as never);
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it('ranks by the main video filename, ahead of provider popularity and trust', async () => {
    const { search } = setupTest(directory);
    const result = await search([
      entry(1, 'Movie.Title.2026.2160p.BluRay.HEVC-OTHER', { from_trusted: true }),
      entry(2, video.replace('.mkv', '')),
    ]);
    expect(result.candidates.map(candidate => candidate.release)).toEqual([
      video.replace('.mkv', ''),
      'Movie.Title.2026.2160p.BluRay.HEVC-OTHER',
    ]);
    expect(result.candidates[0].filenameSimilarity).toBe(100);
    expect(result.candidates[1].filenameSimilarity).toBeLessThan(100);
  });

  it('keeps provider-confirmed file matches first and uses subtitle filenames too', async () => {
    const { search } = setupTest(directory);
    const result = await search([
      entry(1, 'Movie Title', {
        files: [{ file_id: 1, file_name: video.replace('.mkv', '.srt') }],
      }),
      entry(2, 'Provider file match', { moviehash_match: true }),
    ]);
    expect(result.candidates[0].match).toBe('file');
    expect(result.candidates[1].filenameSimilarity).toBe(100);
  });

  it('returns unknown scores and preserves trust ordering when metadata is missing', async () => {
    const { source, search } = setupTest(directory);
    source.file = Buffer.alloc(0);
    const result = await search([entry(1, 'Other'), entry(2, 'Trusted', { from_trusted: true })]);
    expect(result.candidates[0].release).toBe('Trusted');
    expect(result.candidates.every(candidate => candidate.filenameSimilarity === null)).toBe(true);
  });

  it('shares a download across candidates and reuses the saved file after a restart', async () => {
    const { service, request, search } = setupTest(directory);
    const first = (await search([entry(42, 'Movie Title')])).candidates[0];
    const second = (await search([entry(42, 'Movie Title')])).candidates[0];
    request.mockResolvedValueOnce({
      ok: true,
      body: { link: 'https://dl.opensubtitles.com/fixture' },
    });
    const bytes = new TextEncoder().encode('1\n00:00:01,000 --> 00:00:02,000\nHello\n');
    request.mockResolvedValueOnce({ ok: true, body: bytes.buffer });
    const tracks = await Promise.all([service.getTrack(first.id), service.getTrack(second.id)]);
    expect(tracks[0]).toBe(tracks[1]);
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('/download'))).toHaveLength(1);
    expect(await readFile(join(directory, 'subtitles/opensubtitles/42.vtt'), 'utf8')).toBe(
      tracks[0]
    );

    const restarted = setupTest(directory);
    const candidate = (await restarted.search([entry(42, 'Movie Title')])).candidates[0];
    restarted.request.mockClear();
    expect(await restarted.service.getTrack(candidate.id)).toBe(tracks[0]);
    expect(restarted.request).not.toHaveBeenCalled();
    restarted.verify.mockResolvedValue(null);
    await expect(restarted.service.getTrack(candidate.id)).rejects.toThrow(
      'Subtitle is unavailable'
    );
  });

  it('restores search results with fresh access IDs after a restart without a provider request', async () => {
    const original = setupTest(directory);
    const first = (await original.search([entry(42, 'Movie Title')])).candidates[0];
    const restarted = setupTest(directory);
    const restored = await restarted.service.search('new-streaming-key', 'user', 'en', false);
    expect(restarted.request).not.toHaveBeenCalled();
    expect(restored.candidates[0]).toMatchObject({ fileId: 42, release: 'Movie Title' });
    expect(restored.candidates[0].id).not.toBe(first.id);
    restarted.verify.mockResolvedValue(null);
    await expect(restarted.service.search('expired-key', 'user', 'en', false)).rejects.toThrow(
      'Playback is unavailable'
    );
    expect(restarted.request).not.toHaveBeenCalled();
  });

  it('keeps remembered lists separate by language and hearing-impaired preference', async () => {
    const { service, request, search } = setupTest(directory);
    await search([entry(42, 'English')]);
    request.mockResolvedValueOnce({
      ok: true,
      body: { data: [entry(43, 'French', { language: 'fr' })] },
    });
    expect((await service.search('key', 'user', 'fr', false)).candidates[0].fileId).toBe(43);
    request.mockClear();
    expect((await service.search('key', 'user', 'en', false)).candidates[0].fileId).toBe(42);
    expect(request).not.toHaveBeenCalled();
  });

  it('does not spend quota to repair a corrupt stored file', async () => {
    const { service, request, search } = setupTest(directory);
    const candidate = (await search([entry(42, 'Movie Title')])).candidates[0];
    const cacheDirectory = join(directory, 'subtitles/opensubtitles');
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(join(cacheDirectory, '42.vtt'), 'invalid cached content');
    request.mockClear();
    await expect(service.getTrack(candidate.id)).rejects.toThrow('no valid cues');
    expect(request).not.toHaveBeenCalled();
  });

  it('does not leave a stored file after a failed download and allows retry', async () => {
    const { service, request, search } = setupTest(directory);
    const candidate = (await search([entry(42, 'Movie Title')])).candidates[0];
    request.mockResolvedValueOnce({ ok: false });
    await expect(service.getTrack(candidate.id)).rejects.toThrow('download request failed');
    request.mockResolvedValueOnce({
      ok: true,
      body: { link: 'https://dl.opensubtitles.com/fixture' },
    });
    request.mockResolvedValueOnce({
      ok: true,
      body: new TextEncoder().encode('1\n00:00:01,000 --> 00:00:02,000\nHello\n').buffer,
    });
    expect(await service.getTrack(candidate.id)).toContain('Hello');
  });
});
