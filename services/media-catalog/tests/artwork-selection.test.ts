import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import { ArtworkRepository } from '../src/db/artwork.repo';
import { CatalogDatabase } from '../src/db/database';
import { MovieRepository } from '../src/db/movie.repo';
import type { CatalogProvider } from '../src/provider/provider';
import type { ArtworkAnalysisWorkerClient } from '../src/services/artwork-analysis.worker-client';
import { ArtworkSelectionService } from '../src/services/artwork-selection.service';

const directories: string[] = [];
const makeDatabasePath = () => {
  const path = mkdtempSync(join(tmpdir(), 'catalog-artwork-'));
  directories.push(path);
  return path;
};

afterEach(() =>
  directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }))
);

describe('artwork selection', () => {
  it('persists independent first-passing card and hero logos and stops once both pass', async () => {
    const database = new CatalogDatabase(makeDatabasePath());
    const movies = new MovieRepository(database);
    const repository = new ArtworkRepository(database);
    const candidates = ['first', 'second', 'must-not-download'].map(path => ({
      url: `https://image.tmdb.org/t/p/original/${path}.png`,
      language: 'en',
      width: 300,
      height: 100,
      voteAverage: 0,
      voteCount: 0,
    }));
    const movie = {
      mediaId: 42,
      imdbId: null,
      title: 'Artwork test',
      overview: '',
      tagline: '',
      releaseDate: '',
      runtime: 0,
      poster: '',
      backdrop: 'https://image.tmdb.org/t/p/original/backdrop.jpg',
      logo: 'https://image.tmdb.org/t/p/original/fallback.png',
      logoCandidates: candidates,
      genreIds: [],
      popularity: 10,
      rating: 0,
      translations: [],
    };
    movies.upsertMovie(movie);
    movies.upsertMovie({
      ...movie,
      mediaId: 43,
      title: 'Artwork cache test',
      backdrop: 'https://image.tmdb.org/t/p/original/backdrop-second.jpg',
    });
    const row = movies.getMovie(42)!;
    const secondRow = movies.getMovie(43)!;
    const measured: string[] = [];
    const decodedInputs: Array<string | undefined> = [];
    const fakeWorker = {
      prepare: async () => ({
        type: 'backdrop' as const,
        png: 'prepared-backdrop',
        luminance: 'prepared-luminance',
        pixelBytes: 32,
      }),
      measure: async ({ logoUrl, decodedPng }: { logoUrl: string; decodedPng?: string }) => {
        measured.push(logoUrl);
        decodedInputs.push(decodedPng);
        const isFirst = logoUrl.endsWith('/first.png');
        return {
          type: 'logo' as const,
          width: 100,
          height: 30,
          decodedPng: 'decoded-logo',
          card: { coverage: isFirst ? 0.9 : 0.2, median: isFirst ? 5 : 1.2, passes: isFirst },
          hero: { coverage: isFirst ? 0.1 : 0.85, median: isFirst ? 1 : 4, passes: !isFirst },
        };
      },
      close: async () => undefined,
    } satisfies Pick<ArtworkAnalysisWorkerClient, 'prepare' | 'measure' | 'close'>;
    const provider = {
      name: 'tmdb',
      getBackdropAnalysisSource: (backdrop: string) => ({
        key: backdrop.includes('second') ? 'backdrop-asset-43' : 'backdrop-asset-42',
        url: 'https://image.tmdb.org/t/p/w780/backdrop.jpg',
      }),
    } as unknown as CatalogProvider;
    const service = new ArtworkSelectionService(repository, provider, fakeWorker);
    const updates: Array<{ logo: string; heroLogo: string; cardLogoStatus: string }> = [];
    service.subscribe(update => updates.push(update));

    service.enqueue({ ref: { mediaType: 'movie', mediaId: 42 }, row, priority: 60_000 });
    service.enqueue({ ref: { mediaType: 'movie', mediaId: 43 }, row: secondRow, priority: 60_000 });
    service.start();
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (
          repository.get('movie', 42)?.status === 'ready' &&
          repository.get('movie', 43)?.status === 'ready'
        )
          break;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      const saved = repository.get('movie', 42)!;
      expect(saved.status).toBe('ready');
      expect(saved.cardLogo).toBe(candidates[0]!.url);
      expect(saved.heroLogo).toBe(candidates[1]!.url);
      expect(measured).toEqual([
        candidates[0]!.url.replace('/original/', '/w300/'),
        candidates[1]!.url.replace('/original/', '/w300/'),
        candidates[0]!.url.replace('/original/', '/w300/'),
        candidates[1]!.url.replace('/original/', '/w300/'),
      ]);
      expect(decodedInputs).toEqual([undefined, undefined, 'decoded-logo', 'decoded-logo']);
      expect(updates[0]).toMatchObject({
        logo: 'https://image.tmdb.org/t/p/original/fallback.png',
        heroLogo: 'https://image.tmdb.org/t/p/original/fallback.png',
        cardLogoStatus: 'pending',
      });
      expect(updates.at(-1)).toMatchObject({
        logo: candidates[0]!.url,
        heroLogo: candidates[1]!.url,
        cardLogoStatus: 'ready',
      });
    } finally {
      await service.stop();
      database.close();
    }
  });

  it('persists queued work, promotes priority, retries after delay, and rejects stale results', () => {
    const path = makeDatabasePath();
    let database = new CatalogDatabase(path);
    let repository = new ArtworkRepository(database);
    const candidate = {
      url: 'https://image.tmdb.org/t/p/w300/logo.png',
      language: null,
      width: 0,
      height: 0,
      voteAverage: 0,
      voteCount: 0,
    };
    const enqueue = (mediaId: number, signature: string, priority: number) =>
      repository.enqueue({
        mediaType: 'movie',
        mediaId,
        signature,
        imageKey: `tmdb:backdrop-${mediaId}`,
        backdropUrl: 'https://image.tmdb.org/t/p/w300/backdrop.jpg',
        displayBackdrop: 'https://image.tmdb.org/t/p/original/backdrop.jpg',
        fallbackLogo: 'https://image.tmdb.org/t/p/original/provider-logo.png',
        candidates: [candidate],
        popularity: 1,
        priority,
      });

    const initial = enqueue(100, 'signature-1', 40_000);
    enqueue(101, 'signature-2', 60_000);
    const promoted = enqueue(100, 'signature-1', 100_000);
    expect(promoted.priority).toBe(100_000);
    expect(promoted.cardLogo).toBe('https://image.tmdb.org/t/p/original/provider-logo.png');
    expect(promoted.revision).toBe(initial.revision);
    expect(repository.nextPending()?.mediaId).toBe(100);

    const invalidated = enqueue(100, 'signature-3', 100_000);
    expect(invalidated.revision).toBe(initial.revision + 1);
    expect(
      repository.progress({
        mediaType: 'movie',
        mediaId: 100,
        signature: 'signature-1',
        cursor: 1,
        measurements: [],
        cardLogo: candidate.url,
      })
    ).toBeUndefined();
    expect(repository.get('movie', 100)?.cardLogo).toBe(
      'https://image.tmdb.org/t/p/original/provider-logo.png'
    );

    const failedAt = repository.saveLogoAssetFailure(candidate.url);
    repository.progress({
      mediaType: 'movie',
      mediaId: 100,
      signature: 'signature-3',
      cursor: 0,
      measurements: [],
      retryPending: true,
      retryAfter: failedAt + 60 * 60_000,
    });
    expect(repository.nextPending()?.mediaId).toBe(101);
    database.close();

    database = new CatalogDatabase(path);
    repository = new ArtworkRepository(database);
    expect(repository.nextPending()?.mediaId).toBe(101);
    expect(repository.get('movie', 100)?.retryAfter).toBe(failedAt + 60 * 60_000);
    expect(repository.nextRetryAt()).toBe(failedAt + 60 * 60_000);
    const now = spyOn(Date, 'now').mockReturnValue(failedAt + 60 * 60_000);
    try {
      expect(repository.nextPending()?.mediaId).toBe(100);
    } finally {
      now.mockRestore();
    }
    database.close();
  });

  it('retries an earlier failed logo after a later logo satisfies both targets', async () => {
    const database = new CatalogDatabase(makeDatabasePath());
    const movies = new MovieRepository(database);
    const repository = new ArtworkRepository(database);
    const candidates = ['first', 'second'].map(path => ({
      url: `https://image.tmdb.org/t/p/original/${path}.png`,
      language: 'en',
      width: 300,
      height: 100,
      voteAverage: 0,
      voteCount: 0,
    }));
    movies.upsertMovie({
      mediaId: 44,
      imdbId: null,
      title: 'Retry test',
      overview: '',
      tagline: '',
      releaseDate: '',
      runtime: 0,
      poster: '',
      backdrop: 'https://image.tmdb.org/t/p/original/retry-backdrop.jpg',
      logo: 'https://image.tmdb.org/t/p/original/fallback.png',
      logoCandidates: candidates,
      genreIds: [],
      popularity: 10,
      rating: 0,
      translations: [],
    });
    const row = movies.getMovie(44)!;
    let firstAttempts = 0;
    const fakeWorker = {
      prepare: async () => ({
        type: 'backdrop' as const,
        png: 'prepared-backdrop',
        luminance: 'prepared-luminance',
        pixelBytes: 32,
      }),
      measure: async ({ logoUrl }: { logoUrl: string }) => {
        if (logoUrl.endsWith('/first.png') && firstAttempts++ === 0)
          throw new Error('temporary provider failure');
        return {
          type: 'logo' as const,
          width: 100,
          height: 30,
          decodedPng: 'decoded-logo',
          card: { coverage: 0.9, median: 5, passes: true },
          hero: { coverage: 0.9, median: 5, passes: true },
        };
      },
      close: async () => undefined,
    } satisfies Pick<ArtworkAnalysisWorkerClient, 'prepare' | 'measure' | 'close'>;
    const provider = {
      name: 'tmdb',
      getBackdropAnalysisSource: () => ({
        key: 'retry-backdrop',
        url: 'https://image.tmdb.org/t/p/w780/retry-backdrop.jpg',
      }),
    } as unknown as CatalogProvider;
    const service = new ArtworkSelectionService(repository, provider, fakeWorker);
    service.enqueue({ ref: { mediaType: 'movie', mediaId: 44 }, row, priority: 60_000 });
    service.start();
    let restoreNow: { mockRestore: () => void } | undefined;

    try {
      let saved = repository.get('movie', 44)!;
      for (let attempt = 0; attempt < 100 && saved.retryAfter === null; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 5));
        saved = repository.get('movie', 44)!;
      }
      expect(saved.status).toBe('pending');
      expect(saved.cardLogo).toBe(candidates[1]!.url);
      expect(saved.heroLogo).toBe(candidates[1]!.url);
      expect(saved.retryAfter).not.toBeNull();

      restoreNow = spyOn(Date, 'now').mockReturnValue(saved.retryAfter!);
      service.enqueue({ ref: { mediaType: 'movie', mediaId: 44 }, row, priority: 60_000 });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 5));
        saved = repository.get('movie', 44)!;
        if (saved.status === 'ready' && saved.cardLogo === candidates[0]!.url) break;
      }
      restoreNow.mockRestore();
      restoreNow = undefined;

      expect(saved.status).toBe('ready');
      expect(saved.cardLogo).toBe(candidates[0]!.url);
      expect(saved.heroLogo).toBe(candidates[0]!.url);
      expect(firstAttempts).toBe(2);
    } finally {
      restoreNow?.mockRestore();
      await service.stop();
      database.close();
    }
  });
});
