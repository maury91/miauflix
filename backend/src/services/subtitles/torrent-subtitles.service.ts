import { type ChildProcess, spawn } from 'node:child_process';
import { posix } from 'node:path';

import { logger } from '@logger';

import type { ContentSource } from '@entities/content-source.entity';
import type { EncryptedStorageLayout } from '@entities/storage.entity';
import type { DownloadService } from '@services/download/download.service';
import { isVideoFile } from '@services/download/download.utils';
import { openTorrentInput } from '@services/playback/torrent-input';

import { toWebVtt, webVttWindow } from './subtitles.util';

const MAX_BYTES = 2 * 1024 * 1024;
const TEXT_CODECS = new Set(['subrip', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);
const EXTENSIONS = new Set(['.srt', '.vtt', '.ass', '.ssa']);

export interface TorrentSubtitle {
  fileId: string;
  provider: 'embedded' | 'torrent';
  language: string;
  release: string;
  hearingImpaired: boolean;
  path?: string;
  videoFilePath?: string;
  streamIndex?: number;
}

const languageNames = new Map<string, string>();
const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
for (let first = 97; first <= 122; first++) {
  for (let second = 97; second <= 122; second++) {
    const code = String.fromCharCode(first, second);
    const name = displayNames.of(code);
    if (name && name !== code) languageNames.set(name.toLowerCase(), code);
  }
}

function subtitleLanguage(token: string): string | undefined {
  const named = languageNames.get(token);
  if (named) return named;
  try {
    const language = new Intl.Locale(token).language;
    if (language !== 'und' && displayNames.of(language) !== language) return language;
  } catch {
    /* Not a language token. */
  }
  return undefined;
}

function stem(path: string): string {
  return posix
    .basename(path, posix.extname(path))
    .toLowerCase()
    .replace(/[._ ]+/g, '.');
}

/** Require the selected video's exact stem, or an unambiguous single-video torrent. */
export function matchingSubtitleFiles(layout: EncryptedStorageLayout): TorrentSubtitle[] {
  const videoStem = stem(layout.video.path);
  const singleVideo =
    layout.files.filter(file => isVideoFile(file.path.toLowerCase())).length === 1;
  return layout.files.flatMap(file => {
    if (
      !EXTENSIONS.has(posix.extname(file.path).toLowerCase()) ||
      file.length > MAX_BYTES ||
      file.length <= 0
    )
      return [];
    const subtitleStem = stem(file.path);
    const suffix =
      subtitleStem === videoStem
        ? ''
        : subtitleStem.startsWith(`${videoStem}.`)
          ? subtitleStem.slice(videoStem.length + 1)
          : null;
    const parts = (suffix ?? subtitleStem).split(/[._ ]+/).filter(Boolean);
    const languageToken = parts.find(
      part => !['sdh', 'cc', 'forced', 'full'].includes(part) && subtitleLanguage(part)
    );
    const language = languageToken ? subtitleLanguage(languageToken)! : 'und';
    const onlyTags = parts.every(
      part => part === languageToken || ['sdh', 'cc', 'forced', 'full', 'hi'].includes(part)
    );
    const parentMatches =
      posix
        .basename(posix.dirname(file.path))
        .toLowerCase()
        .replace(/[._ ]+/g, '.') === videoStem;
    if (
      !(suffix !== null && (suffix === '' || onlyTags)) &&
      !(onlyTags && (singleVideo || parentMatches))
    )
      return [];
    return [
      {
        fileId: `torrent:${file.path}`,
        provider: 'torrent' as const,
        path: file.path,
        language,
        release: posix.basename(file.path),
        hearingImpaired: parts.some(
          part => part !== languageToken && ['sdh', 'cc', 'hi'].includes(part)
        ),
      },
    ];
  });
}

/** Text subtitle discovery/extraction through decrypted, verified torrent ranges. */
export class TorrentSubtitlesService {
  private readonly probes = new Map<
    string,
    { expires: number; promise: Promise<TorrentSubtitle[]> }
  >();
  private readonly processes = new Set<ChildProcess>();
  private active = 0;
  private closed = false;

  constructor(private readonly downloads: DownloadService) {}

  async discover(source: ContentSource, videoFilePath?: string): Promise<TorrentSubtitle[]> {
    const layout = await this.downloads.getMediaFiles(source, videoFilePath);
    const sidecars = matchingSubtitleFiles(layout);
    await this.downloads.prepareSubtitleFiles(
      source,
      sidecars.map(track => track.path!),
      videoFilePath
    );
    let embedded: TorrentSubtitle[] = [];
    try {
      const cacheKey = `${source.id}:${videoFilePath ?? ''}`;
      const cached = this.probes.get(cacheKey);
      if (cached && cached.expires > Date.now()) embedded = await cached.promise;
      else {
        if (this.probes.size >= 64) this.probes.delete(this.probes.keys().next().value!);
        const promise = this.probe(source, videoFilePath).catch(error => {
          this.probes.delete(cacheKey);
          throw error;
        });
        this.probes.set(cacheKey, { expires: Date.now() + 15 * 60_000, promise });
        embedded = await promise;
      }
    } catch (error) {
      logger.warn(
        'TorrentSubtitlesService',
        'Embedded subtitle inspection failed',
        error instanceof Error ? error.message : error
      );
    }
    return [...embedded, ...sidecars].map(track => ({
      ...track,
      videoFilePath,
      fileId: `${source.id}:${track.fileId}`,
    }));
  }

  private async probe(source: ContentSource, videoFilePath?: string): Promise<TorrentSubtitle[]> {
    const body = await this.run(
      source,
      'ffprobe',
      [
        '-select_streams',
        's',
        '-show_entries',
        'stream=index,codec_name:stream_tags=language,title:stream_disposition=hearing_impaired',
        '-of',
        'json',
      ],
      undefined,
      0,
      videoFilePath
    );
    const probe = JSON.parse(body) as {
      streams?: Array<{
        index: number;
        codec_name: string;
        tags?: { language?: string; title?: string };
        disposition?: { hearing_impaired?: number };
      }>;
    };
    return (probe.streams ?? [])
      .filter(
        stream =>
          Number.isSafeInteger(stream.index) &&
          stream.index >= 0 &&
          TEXT_CODECS.has(stream.codec_name)
      )
      .slice(0, 30)
      .map(stream => ({
        fileId: `embedded:${stream.index}`,
        provider: 'embedded',
        streamIndex: stream.index,
        language: stream.tags?.language ?? 'und',
        release:
          stream.tags?.title || `Embedded ${stream.codec_name.toUpperCase()} track ${stream.index}`,
        hearingImpaired: stream.disposition?.hearing_impaired === 1,
      }));
  }

  async getTrack(source: ContentSource, track: TorrentSubtitle, startSeconds = 0): Promise<string> {
    if (track.provider === 'torrent') {
      // Revalidate against the current selected video and layout before opening a sidecar.
      const layout = await this.downloads.getMediaFiles(source, track.videoFilePath);
      if (!matchingSubtitleFiles(layout).some(file => file.path === track.path))
        throw new Error('Subtitle file no longer matches this video');
    }
    const args = [
      '-map',
      track.provider === 'embedded' ? `0:${track.streamIndex}` : '0:s:0',
      '-vn',
      '-an',
      '-c:s',
      'webvtt',
      '-f',
      'webvtt',
      'pipe:1',
    ];
    const body = await this.run(
      source,
      'ffmpeg',
      args,
      track.path,
      startSeconds,
      track.videoFilePath
    );
    return track.provider === 'embedded'
      ? webVttWindow(body, startSeconds, startSeconds + 120)
      : toWebVtt(body);
  }

  private async run(
    source: ContentSource,
    program: 'ffmpeg' | 'ffprobe',
    args: string[],
    path?: string,
    startSeconds = 0,
    videoFilePath?: string
  ): Promise<string> {
    if (this.closed || this.active >= 2) throw new Error('Subtitle preparation is busy');
    this.active++;
    let input: Awaited<ReturnType<typeof openTorrentInput>> | undefined;
    let child: ChildProcess | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      input = await openTorrentInput(this.downloads, source, path ?? videoFilePath);
      if (this.closed) throw new Error('Subtitle preparation is shutting down');
      const common = [
        '-v',
        'error',
        '-rw_timeout',
        '30000000',
        '-protocol_whitelist',
        'http,tcp',
        '-format_whitelist',
        'matroska,webm,mov,avi,asf,flv,ogg,srt,webvtt,ass',
      ];
      child = spawn(
        program,
        program === 'ffmpeg'
          ? [
              '-nostdin',
              ...common,
              ...(path ? [] : ['-ss', String(Math.max(0, startSeconds - 10)), '-copyts']),
              '-i',
              input.url,
              ...(path ? [] : ['-to', String(startSeconds + 120)]),
              ...args,
            ]
          : [...common, ...args, input.url],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      this.processes.add(child);
      const process = child;
      let bytes = 0;
      const chunks: Buffer[] = [];
      let failure: Error | undefined;
      process.stdout!.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          failure = new Error('Subtitle output is too large');
          process.kill('SIGKILL');
        } else chunks.push(chunk);
      });
      process.stderr!.resume();
      timeout = setTimeout(() => {
        failure = new Error('Subtitle preparation timed out');
        process.kill('SIGKILL');
        void input?.close();
      }, 45_000);
      timeout.unref();
      await new Promise<void>((resolve, reject) => {
        process.once('error', () => reject(new Error('FFmpeg is unavailable')));
        process.once('close', code =>
          code === 0 && !failure
            ? resolve()
            : reject(failure ?? new Error('Subtitle extraction failed'))
        );
      });
      return Buffer.concat(chunks).toString('utf8');
    } finally {
      if (timeout) clearTimeout(timeout);
      if (child) this.processes.delete(child);
      await input?.close();
      this.active--;
    }
  }

  close(): void {
    this.closed = true;
    for (const child of this.processes) child.kill('SIGKILL');
    this.probes.clear();
  }
}
