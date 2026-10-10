import { randomBytes } from 'node:crypto';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { logger } from '@logger';
import parseTorrent from 'parse-torrent';

import type { ConfigService } from '@mytypes/configuration';
import { isVideoFile } from '@services/download/download.utils';
import type { MediaService } from '@services/media/media.service';
import type { PlaybackSessionService } from '@services/playback/playback-session.service';
import type { RequestService } from '@services/request/request.service';
import type { StreamService } from '@services/stream/stream.service';

import { filenameSimilarity } from './subtitle-matching';
import { toWebVtt } from './subtitles.util';

const API_BASE = 'https://api.opensubtitles.com/api/v1';
const TRACK_TTL_MS = 15 * 60 * 1000;
const MAX_CANDIDATES = 500;
const MAX_CACHED_TRACK_BYTES = 32 * 1024 * 1024;
const MAX_TRACK_BYTES = 2 * 1024 * 1024;

export interface SubtitleCandidate {
  id: string;
  provider: 'opensubtitles';
  fileId: number;
  language: string;
  languageLabel: string;
  release: string;
  hearingImpaired: boolean;
  trusted: boolean;
  match: 'file' | 'release' | 'title';
  filenameSimilarity: number | null;
}

export interface SubtitleSearchResult {
  configured: boolean;
  available: boolean;
  candidates: SubtitleCandidate[];
}

interface OpenSubtitlesFile {
  file_id: number;
  file_name?: string;
}

interface OpenSubtitlesResult {
  attributes: {
    language: string;
    release?: string;
    hearing_impaired?: boolean;
    from_trusted?: boolean;
    moviehash_match?: boolean;
    feature_details?: { imdb_id?: number | string };
    files: OpenSubtitlesFile[];
  };
}

interface CandidateRecord {
  candidate: SubtitleCandidate;
  fileId: number;
  streamingKey: string;
  userId: string;
  sourceId: number;
  playableKey: string;
  expiresAt: number;
  trackPromise?: Promise<string>;
}

/** OpenSubtitles search and playback-bound subtitle delivery. */
export class SubtitlesService {
  private readonly candidates = new Map<string, CandidateRecord>();
  private readonly tracks = new Map<string, { body: string; bytes: number }>();
  private cachedTrackBytes = 0;
  private readonly pendingFiles = new Map<number, Promise<string>>();

  constructor(
    private readonly config: ConfigService,
    private readonly requestService: RequestService,
    private readonly playbackSessionService: PlaybackSessionService,
    private readonly streamService: StreamService,
    private readonly mediaService: MediaService
  ) {}

  async search(
    streamingKey: string,
    userId: string,
    language: string,
    hearingImpaired: boolean,
    refresh = false
  ): Promise<SubtitleSearchResult> {
    const grant = await this.playbackSessionService.verify(streamingKey);
    if (!grant || grant.userId !== userId) throw new SubtitleAccessError('Playback is unavailable');
    if (grant.playableKind !== 'movie') {
      return { configured: this.isConfigured(), available: true, candidates: [] };
    }

    const apiKey = this.apiKey();
    if (!apiKey) return { configured: false, available: false, candidates: [] };

    const source = await this.streamService.getSourceById(grant.sourceId);
    const movie = source ? await this.mediaService.getMovieById(source.movieId) : null;
    if (!source || !movie || `m:${movie.mediaId}` !== grant.playableKey) {
      throw new SubtitleAccessError('Playback source is unavailable');
    }
    if (!movie.imdbId || !/^tt\d+$/.test(movie.imdbId)) {
      return { configured: true, available: true, candidates: [] };
    }

    const params = new URLSearchParams({
      imdb_id: String(Number(movie.imdbId.slice(2))),
      languages: language,
      type: 'movie',
      order_by: 'download_count',
      order_direction: 'desc',
      hearing_impaired: hearingImpaired ? 'include' : 'exclude',
    });

    try {
      const results = await this.searchResults(
        movie.imdbId,
        language,
        hearingImpaired,
        params,
        apiKey,
        refresh
      );
      if (!results) return { configured: true, available: false, candidates: [] };
      const videoFilename = await this.getSelectedVideoFilename(source.file);
      const ranked = results
        .map(result => {
          const candidate = result.attributes;
          const release = candidate.release || candidate.files[0].file_name || 'Subtitle';
          const score = filenameSimilarity(
            videoFilename,
            [candidate.release, candidate.files[0].file_name].filter(
              (name): name is string => !!name
            )
          );
          const match: SubtitleCandidate['match'] = candidate.moviehash_match
            ? 'file'
            : score !== null && score >= 60
              ? 'release'
              : 'title';
          return { result, candidate, match, release, score };
        })
        .filter(item => !hearingImpaired || item.candidate.hearing_impaired)
        .sort(
          (left, right) =>
            Number(right.match === 'file') - Number(left.match === 'file') ||
            (right.score ?? -1) - (left.score ?? -1) ||
            Number(right.candidate.from_trusted ?? false) -
              Number(left.candidate.from_trusted ?? false)
        )
        .slice(0, 30);

      this.prune();
      const candidates = ranked.map(({ result, candidate, match, release, score }) => {
        const id = randomBytes(18).toString('base64url');
        const item: SubtitleCandidate = {
          id,
          provider: 'opensubtitles',
          fileId: result.attributes.files[0].file_id,
          language: candidate.language,
          languageLabel: this.languageName(candidate.language),
          release,
          hearingImpaired: candidate.hearing_impaired ?? false,
          trusted: candidate.from_trusted ?? false,
          match,
          filenameSimilarity: score,
        };
        this.candidates.set(id, {
          candidate: item,
          fileId: result.attributes.files[0].file_id,
          streamingKey,
          userId,
          sourceId: grant.sourceId,
          playableKey: grant.playableKey,
          expiresAt: Math.min(grant.expiresAt.getTime(), Date.now() + TRACK_TTL_MS),
        });
        return item;
      });
      this.prune();
      return { configured: true, available: true, candidates };
    } catch (error) {
      logger.warn(
        'SubtitlesService',
        'OpenSubtitles search failed',
        error instanceof Error ? error.message : error
      );
      return { configured: true, available: false, candidates: [] };
    }
  }

  private async searchResults(
    imdbId: string,
    language: string,
    hearingImpaired: boolean,
    params: URLSearchParams,
    apiKey: string,
    refresh: boolean
  ): Promise<OpenSubtitlesResult[] | null> {
    const directory = resolve(this.config.getOrThrow('DATA_DIR'), 'subtitles', 'searches');
    const filename = resolve(
      directory,
      `${imdbId}-${language.toLowerCase()}-${hearingImpaired ? 'sdh' : 'standard'}.json`
    );
    if (!refresh) {
      try {
        const file = await open(filename, 'r');
        try {
          if ((await file.stat()).size > MAX_TRACK_BYTES)
            throw new Error('Stored subtitle list is too large');
          return this.parseSearchResponse(JSON.parse(await file.readFile('utf8')), imdbId);
        } finally {
          await file.close();
        }
      } catch (error) {
        if (
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 'ENOENT'
        )
          throw error;
      }
    }
    const response = await this.requestService.request<unknown>(`${API_BASE}/subtitles?${params}`, {
      headers: this.headers(apiKey),
      timeout: 10_000,
      maxResponseBytes: MAX_TRACK_BYTES,
    });
    if (!response.ok) return null;
    const results = this.parseSearchResponse(response.body, imdbId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await this.storeFile(filename, JSON.stringify({ data: results }));
    return results;
  }

  private async storeFile(filename: string, body: string): Promise<void> {
    const temporary = `${filename}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      await writeFile(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, filename);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async getTrack(candidateId: string): Promise<string> {
    const record = this.candidates.get(candidateId);
    const grant = record ? await this.playbackSessionService.verify(record.streamingKey) : null;
    if (
      !grant ||
      !record ||
      record.expiresAt <= Date.now() ||
      grant.sourceId !== record.sourceId ||
      grant.userId !== record.userId ||
      grant.playableKey !== record.playableKey
    ) {
      if (record) this.removeCandidate(candidateId);
      throw new SubtitleAccessError('Subtitle is unavailable');
    }

    const cached = this.tracks.get(candidateId);
    if (cached) {
      this.tracks.delete(candidateId);
      this.tracks.set(candidateId, cached);
      return cached.body;
    }
    if (record.trackPromise) return record.trackPromise;

    record.trackPromise = this.loadTrack(record.fileId)
      .then(body => {
        const bytes = Buffer.byteLength(body);
        if (bytes <= MAX_CACHED_TRACK_BYTES) {
          this.tracks.set(candidateId, { body, bytes });
          this.cachedTrackBytes += bytes;
          this.trimTrackCache();
        }
        return body;
      })
      .finally(() => {
        record.trackPromise = undefined;
      });
    return record.trackPromise;
  }

  /** Provider file IDs survive candidate/session expiry; cached files live in the data volume. */
  private loadTrack(fileId: number): Promise<string> {
    const pending = this.pendingFiles.get(fileId);
    if (pending) return pending;
    const loading = this.loadStoredTrack(fileId).finally(() => {
      if (this.pendingFiles.get(fileId) === loading) this.pendingFiles.delete(fileId);
    });
    this.pendingFiles.set(fileId, loading);
    return loading;
  }

  private async loadStoredTrack(fileId: number): Promise<string> {
    const directory = resolve(this.config.getOrThrow('DATA_DIR'), 'subtitles', 'opensubtitles');
    const filename = resolve(directory, `${fileId}.vtt`);
    try {
      const file = await open(filename, 'r');
      try {
        const stats = await file.stat();
        if (stats.size > MAX_TRACK_BYTES) throw new Error('Stored subtitle file is too large');
        return toWebVtt((await file.readFile('utf8')).trimEnd());
      } finally {
        await file.close();
      }
    } catch (error) {
      // Never spend quota to mask permission, corruption or storage failures.
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      )
        throw error;
    }

    await mkdir(directory, { recursive: true, mode: 0o700 });
    const body = await this.downloadTrack(fileId);
    await this.storeFile(filename, body);
    return body;
  }

  private async downloadTrack(fileId: number): Promise<string> {
    const apiKey = this.apiKey();
    if (!apiKey) throw new Error('OpenSubtitles is not configured');

    const download = await this.requestService.request<unknown>(`${API_BASE}/download`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'content-type': 'application/json' },
      body: JSON.stringify({ file_id: fileId, sub_format: 'srt' }),
      timeout: 10_000,
      maxResponseBytes: 64 * 1024,
    });
    if (!download.ok || !download.body || typeof download.body !== 'object') {
      throw new Error('OpenSubtitles download request failed');
    }
    const link = (download.body as { link?: unknown }).link;
    if (typeof link !== 'string') throw new Error('OpenSubtitles returned no download link');
    const url = new URL(link);
    if (
      url.protocol !== 'https:' ||
      !url.hostname.endsWith('.opensubtitles.com') ||
      (url.port !== '' && url.port !== '443')
    ) {
      throw new Error('OpenSubtitles returned an invalid download host');
    }

    const file = await this.requestService.request(url, {
      asBuffer: true,
      redirect: 'error',
      timeout: 10_000,
      maxResponseBytes: MAX_TRACK_BYTES,
    });
    if (!file.ok || !(file.body instanceof ArrayBuffer)) {
      throw new Error('Subtitle file download failed');
    }
    return toWebVtt(Buffer.from(file.body).toString('utf8'));
  }

  private parseSearchResponse(body: unknown, imdbId: string): OpenSubtitlesResult[] {
    if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data)) {
      return [];
    }
    const imdbNumber = String(Number(imdbId.slice(2)));
    return body.data.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || !('attributes' in entry)) return [];
      const attributes = entry.attributes;
      if (!attributes || typeof attributes !== 'object') return [];
      const value = attributes as Record<string, unknown>;
      const files = value['files'];
      const language = value['language'];
      if (
        !Array.isArray(files) ||
        files.length !== 1 ||
        typeof language !== 'string' ||
        !/^[a-z]{2,3}$/i.test(language)
      ) {
        return [];
      }
      const file = files[0] as Record<string, unknown> | null;
      if (!file || !Number.isSafeInteger(file['file_id']) || Number(file['file_id']) <= 0)
        return [];
      const details = value['feature_details'];
      if (details && typeof details === 'object' && 'imdb_id' in details) {
        if (String(details.imdb_id) !== imdbNumber) return [];
      }
      return [
        {
          attributes: {
            language: language.toLowerCase(),
            release: typeof value['release'] === 'string' ? value['release'] : undefined,
            hearing_impaired: value['hearing_impaired'] === true,
            from_trusted: value['from_trusted'] === true,
            moviehash_match: value['moviehash_match'] === true,
            feature_details: details as { imdb_id?: number | string } | undefined,
            files: [
              {
                file_id: file['file_id'] as number,
                file_name: typeof file['file_name'] === 'string' ? file['file_name'] : undefined,
              },
            ],
          },
        },
      ];
    });
  }

  private async getSelectedVideoFilename(metadata?: Buffer): Promise<string | undefined> {
    if (!metadata?.length) return undefined;
    try {
      const parsed = await parseTorrent(metadata);
      return (parsed.files ?? [])
        .filter(file => isVideoFile(file.name.toLowerCase()))
        .sort((left, right) => right.length - left.length)[0]?.name;
    } catch {
      return undefined;
    }
  }

  private languageName(code: string): string {
    try {
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code.toUpperCase();
    } catch {
      return code.toUpperCase();
    }
  }

  private headers(apiKey: string): Record<string, string> {
    return { 'api-key': apiKey, 'user-agent': 'Miauflix v1.0.0', accept: 'application/json' };
  }

  private apiKey(): string | undefined {
    return this.config.get('OPENSUBTITLES_API_KEY')?.trim() || undefined;
  }

  private isConfigured(): boolean {
    return !!this.apiKey();
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, candidate] of this.candidates) {
      if (candidate.expiresAt <= now) this.removeCandidate(id);
    }
    while (this.candidates.size > MAX_CANDIDATES) {
      const oldest = this.candidates.keys().next().value as string | undefined;
      if (!oldest) break;
      this.removeCandidate(oldest);
    }
  }

  private trimTrackCache(): void {
    while (this.cachedTrackBytes > MAX_CACHED_TRACK_BYTES && this.tracks.size > 0) {
      const oldest = this.tracks.keys().next().value as string | undefined;
      if (!oldest) break;
      const removed = this.tracks.get(oldest);
      this.tracks.delete(oldest);
      this.cachedTrackBytes -= removed?.bytes ?? 0;
    }
  }

  private removeCandidate(id: string): void {
    this.candidates.delete(id);
    const cached = this.tracks.get(id);
    if (cached) {
      this.tracks.delete(id);
      this.cachedTrackBytes -= cached.bytes;
    }
  }
}

export class SubtitleAccessError extends Error {}
