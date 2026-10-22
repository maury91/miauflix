import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { logger } from '@logger';
import parseTorrent from 'parse-torrent';

import type { ConfigService } from '@mytypes/configuration';
import { isVideoFile } from '@services/download/download.utils';
import type { PlaybackSessionService } from '@services/playback/playback-session.service';
import type { RequestService } from '@services/request/request.service';
import type { StreamService } from '@services/stream/stream.service';

import { filenameSimilarity } from './subtitle-matching';
import { toWebVtt } from './subtitles.util';
import type { TorrentSubtitle, TorrentSubtitlesService } from './torrent-subtitles.service';

const API_BASE = 'https://api.opensubtitles.com/api/v1';
const MAX_CANDIDATES = 500;
const MAX_CACHED_TRACK_BYTES = 32 * 1024 * 1024;
const MAX_CACHED_TRACKS = 256;
const MAX_TRACK_BYTES = 2 * 1024 * 1024;

export interface SubtitleCandidate {
  id: string;
  provider: 'embedded' | 'opensubtitles' | 'torrent';
  fileId: number | string;
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
  fileId: number | string;
  streamingKey: string;
  userId: string;
  sourceId: number;
  playableKey: string;
  expiresAt: number;
  local?: TorrentSubtitle;
}

function makeCandidateId(
  provider: SubtitleCandidate['provider'],
  sourceId: number,
  fileId: number | string,
  playableKey?: string
): string {
  if (provider === 'opensubtitles' && !playableKey)
    return Buffer.from(`v1:${sourceId}:${String(fileId)}`).toString('base64url');
  return createHash('sha256')
    .update(`v1:${provider}:${sourceId}:${String(fileId)}:${playableKey ?? ''}`)
    .digest('base64url')
    .slice(0, 24);
}

function decodeOpenSubtitlesCandidate(id: string): { sourceId: number; fileId: number } | null {
  try {
    const decoded = Buffer.from(id, 'base64url').toString('utf8').split(':');
    if (decoded.length !== 3 || decoded[0] !== 'v1') return null;
    const sourceId = Number(decoded[1]);
    const fileId = Number(decoded[2]);
    if (
      !Number.isSafeInteger(sourceId) ||
      sourceId < 1 ||
      !Number.isSafeInteger(fileId) ||
      fileId < 1
    )
      return null;
    return { sourceId, fileId };
  } catch {
    return null;
  }
}

/** OpenSubtitles search and playback-bound subtitle delivery. */
export class SubtitlesService {
  private readonly candidates = new Map<string, CandidateRecord>();
  private readonly tracks = new Map<string, { body: string; bytes: number }>();
  private cachedTrackBytes = 0;
  private readonly pendingTracks = new Map<string, Promise<string>>();

  constructor(
    private readonly config: ConfigService,
    private readonly requestService: RequestService,
    private readonly playbackSessionService: PlaybackSessionService,
    private readonly streamService: StreamService,
    private readonly torrentSubtitles: TorrentSubtitlesService
  ) {}

  async search(
    streamingKey: string,
    userId: string,
    language: string,
    hearingImpaired: boolean,
    refresh = false,
    localOnly = false
  ): Promise<SubtitleSearchResult> {
    const grant = await this.playbackSessionService.verify(streamingKey);
    if (!grant || grant.userId !== userId) throw new SubtitleAccessError('Playback is unavailable');
    const resolved = await this.streamService.resolvePlaybackTarget(grant);
    if (!resolved) throw new SubtitleAccessError('Playback source is unavailable');
    const { source } = resolved.target;
    const local: SubtitleCandidate[] = [];
    try {
      for (const track of await this.torrentSubtitles.discover(resolved.target)) {
        const candidate: SubtitleCandidate = {
          id: makeCandidateId(track.provider, source.id, track.fileId, grant.playableKey),
          provider: track.provider,
          fileId: track.fileId,
          language: track.language,
          languageLabel: this.languageName(track.language),
          release: track.release,
          hearingImpaired: track.hearingImpaired,
          trusted: false,
          match: 'file',
          filenameSimilarity: track.provider === 'torrent' ? 100 : null,
        };
        this.candidates.set(candidate.id, {
          candidate,
          fileId: candidate.fileId,
          local: track,
          streamingKey,
          userId,
          sourceId: grant.sourceId,
          playableKey: grant.playableKey,
          expiresAt: grant.expiresAt.getTime(),
        });
        local.push(candidate);
      }
      this.prune();
    } catch (error) {
      logger.warn(
        'SubtitlesService',
        'Torrent subtitle discovery failed',
        error instanceof Error ? error.message : error
      );
    }
    const apiKey = this.apiKey();
    const localResult = () => ({
      configured: !!apiKey,
      available: local.length > 0 || !!apiKey,
      candidates: local,
    });
    if (localOnly || grant.playableKind !== 'movie' || !apiKey) return localResult();
    const { movie } = resolved;
    if (!movie) throw new SubtitleAccessError('Playback source is unavailable');
    if (!movie.imdbId || !/^tt\d+$/.test(movie.imdbId)) return localResult();

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
      if (!results) return { configured: true, available: local.length > 0, candidates: local };
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
        const id = makeCandidateId('opensubtitles', source.id, result.attributes.files[0].file_id);
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
          expiresAt: grant.expiresAt.getTime(),
        });
        return item;
      });
      this.prune();
      return { configured: true, available: true, candidates: [...local, ...candidates] };
    } catch (error) {
      logger.warn(
        'SubtitlesService',
        'OpenSubtitles search failed',
        error instanceof Error ? error.message : error
      );
      return { configured: true, available: local.length > 0, candidates: local };
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

  async getTrack(candidateId: string, streamingKey: string, startSeconds = 0): Promise<string> {
    let record = this.candidates.get(candidateId);
    if (record && record.streamingKey !== streamingKey) {
      this.removeCandidate(candidateId);
      record = undefined;
    }
    let grant = streamingKey ? await this.playbackSessionService.verify(streamingKey) : null;
    if (!record && grant) {
      const resolved = await this.streamService.resolvePlaybackTarget(grant);
      const source = resolved?.target.source;
      if (source && resolved) {
        const remote = decodeOpenSubtitlesCandidate(candidateId);
        if (grant.playableKind === 'movie' && remote?.sourceId === source.id) {
          record = {
            candidate: {
              id: candidateId,
              provider: 'opensubtitles',
              fileId: remote.fileId,
              language: 'und',
              languageLabel: 'Unknown',
              release: 'Subtitle',
              hearingImpaired: false,
              trusted: false,
              match: 'title',
              filenameSimilarity: null,
            },
            fileId: remote.fileId,
            streamingKey,
            userId: grant.userId,
            sourceId: source.id,
            playableKey: grant.playableKey,
            expiresAt: grant.expiresAt.getTime(),
          };
        } else {
          try {
            const local = await this.torrentSubtitles.discover(resolved.target);
            const track = local.find(
              item =>
                makeCandidateId(item.provider, source.id, item.fileId, grant!.playableKey) ===
                candidateId
            );
            if (track) {
              record = {
                candidate: {
                  id: candidateId,
                  provider: track.provider,
                  fileId: track.fileId,
                  language: track.language,
                  languageLabel: this.languageName(track.language),
                  release: track.release,
                  hearingImpaired: track.hearingImpaired,
                  trusted: false,
                  match: 'file',
                  filenameSimilarity: track.provider === 'torrent' ? 100 : null,
                },
                fileId: track.fileId,
                local: track,
                streamingKey,
                userId: grant.userId,
                sourceId: source.id,
                playableKey: grant.playableKey,
                expiresAt: grant.expiresAt.getTime(),
              };
            }
          } catch {
            // Preserve the normal unavailable response for failed rediscovery.
          }
        }
        if (record) this.candidates.set(candidateId, record);
      }
    }
    grant = record ? await this.playbackSessionService.verify(record.streamingKey) : null;
    const resolved = grant ? await this.streamService.resolvePlaybackTarget(grant) : null;
    if (
      !grant ||
      !resolved ||
      !record ||
      record.expiresAt <= Date.now() ||
      grant.sourceId !== record.sourceId ||
      grant.userId !== record.userId ||
      grant.playableKey !== record.playableKey
    ) {
      if (record) this.removeCandidate(candidateId);
      throw new SubtitleAccessError('Subtitle is unavailable');
    }

    if (!Number.isSafeInteger(startSeconds) || startSeconds < 0 || startSeconds > 7 * 24 * 3600)
      throw new SubtitleAccessError('Invalid subtitle position');
    const window = record.local?.provider === 'embedded' ? Math.floor(startSeconds / 60) * 60 : 0;
    const key = `${record.sourceId}:${record.candidate.provider}:${record.fileId}${record.local?.provider === 'embedded' ? `:${window}` : ''}`;
    const cached = this.tracks.get(key);
    if (cached) {
      this.tracks.delete(key);
      this.tracks.set(key, cached);
      return cached.body;
    }
    const pending = this.pendingTracks.get(key);
    if (pending) return pending;

    const loading = (
      record.local
        ? Promise.resolve().then(() => {
            if (resolved.target.source.id !== record.sourceId)
              throw new SubtitleAccessError('Playback source is unavailable');
            return this.torrentSubtitles.getTrack(resolved.target, record.local!, window);
          })
        : this.loadStoredTrack(record.fileId as number)
    )
      .then(body => {
        const bytes = Buffer.byteLength(body);
        if (bytes <= MAX_CACHED_TRACK_BYTES && !this.tracks.has(key)) {
          this.tracks.set(key, { body, bytes });
          this.cachedTrackBytes += bytes;
          this.trimTrackCache();
        }
        return body;
      })
      .finally(() => {
        this.pendingTracks.delete(key);
      });
    this.pendingTracks.set(key, loading);
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
    while (
      (this.cachedTrackBytes > MAX_CACHED_TRACK_BYTES || this.tracks.size > MAX_CACHED_TRACKS) &&
      this.tracks.size > 0
    ) {
      const oldest = this.tracks.keys().next().value as string | undefined;
      if (!oldest) break;
      const removed = this.tracks.get(oldest);
      this.tracks.delete(oldest);
      this.cachedTrackBytes -= removed?.bytes ?? 0;
    }
  }

  private removeCandidate(id: string): void {
    this.candidates.delete(id);
  }
}

export class SubtitleAccessError extends Error {}
