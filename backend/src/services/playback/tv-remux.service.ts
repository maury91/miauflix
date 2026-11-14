import { logger } from '@logger';
import type {
  RemuxAudioTrack,
  RemuxPlan,
  RemuxPriority,
  RemuxStatus,
  RemuxSubtitleKind,
  RemuxSubtitleTrack,
} from '@miauflix/service-contracts';

import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';

import type {
  AudioPlaybackService,
  PlaybackAudioTrack,
  PlaybackDelivery,
  ProbeResult,
} from './audio-playback.service';
import type { PlaybackTarget } from './playback-target';

/** Audio every supported Samsung TV decodes; a language with none of these gets a remux. */
export const TV_AUDIO_CODECS = new Set(['aac', 'ac3', 'eac3', 'mp3']);
/** Audio copied into a remux as it is: AVPlay (Tizen 5.5) ignores E-AC-3 in MPEG-TS. */
const REMUX_COPY_CODECS = new Set(['aac', 'ac3', 'mp3']);
/** Video copied into MPEG-TS HLS as it is; anything else would need a re-encode (not done yet). */
const REMUX_VIDEO_CODECS = new Set(['h264', 'hevc']);
const SUBTITLE_KINDS: Record<string, RemuxSubtitleKind> = {
  subrip: 'text',
  webvtt: 'text',
  mov_text: 'text',
  text: 'text',
  ass: 'styled',
  ssa: 'styled',
  hdmv_pgs_subtitle: 'image',
  dvd_subtitle: 'image',
  dvb_subtitle: 'image',
};
/** A remux still being built plays once this many seconds are ready past the start. */
const READY_AHEAD_SECONDS = 60;
/** How often a prefetched next episode is checked for a finished download, and for how long. */
const DOWNLOAD_POLL_MS = 60_000;
const DOWNLOAD_POLL_LIMIT = 180;

const languageKey = (language: string | undefined): string => {
  if (!language) return 'und';
  try {
    return new Intl.Locale(language.replace(/_/g, '-')).language;
  } catch {
    return language.toLowerCase();
  }
};

/**
 * What a TV remux of a probed file keeps, or null when the file needs none: one audio track per
 * language (a TV-decodable one, copied unless it is E-AC-3, else the one with the most channels;
 * converted ones become AC-3) and every subtitle track the remux can keep. Only H.264 and H.265
 * video is remuxed.
 */
export function remuxPlan(probe: ProbeResult): RemuxPlan | null {
  const streams = probe.streams ?? [];
  const video = streams.find(stream => stream.codec_type === 'video');
  const durationSeconds = Number(probe.format?.duration);
  if (!video || !REMUX_VIDEO_CODECS.has(video.codec_name ?? '')) return null;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const audio = streams
    .filter(stream => stream.codec_type === 'audio')
    .map((stream, audioIndex) => ({ stream, audioIndex }));
  if (!audio.length) return null;
  const groups = new Map<string, typeof audio>();
  for (const track of audio) {
    const key = languageKey(track.stream.tags?.language);
    groups.set(key, [...(groups.get(key) ?? []), track]);
  }
  const channels = (entry: (typeof audio)[number]) => entry.stream.channels ?? 0;
  const isDefault = (entry: (typeof audio)[number]) => entry.stream.disposition?.default === 1;
  const best = (entries: typeof audio) =>
    [...entries].sort(
      (left, right) =>
        Number(isDefault(right)) - Number(isDefault(left)) || channels(right) - channels(left)
    )[0];
  let needed = false;
  const chosen: Array<{ entry: (typeof audio)[number]; copy: boolean }> = [];
  for (const entries of groups.values()) {
    const compatible = entries.filter(entry => TV_AUDIO_CODECS.has(entry.stream.codec_name ?? ''));
    if (compatible.length) {
      // A language the TV already plays still gets a remux track: E-AC-3 converted to AC-3.
      const copied = compatible.filter(entry =>
        REMUX_COPY_CODECS.has(entry.stream.codec_name ?? '')
      );
      const entry = best(copied.length ? copied : compatible);
      chosen.push({ entry, copy: REMUX_COPY_CODECS.has(entry.stream.codec_name ?? '') });
      continue;
    }
    needed = true;
    // Converting, the most channels win: 5.1 TrueHD over a stereo commentary.
    const loudest = [...entries].sort(
      (left, right) =>
        channels(right) - channels(left) || Number(isDefault(right)) - Number(isDefault(left))
    )[0];
    chosen.push({ entry: loudest, copy: false });
  }
  if (!needed) return null;
  chosen.sort((left, right) => left.entry.audioIndex - right.entry.audioIndex);
  const defaultLanguage = languageKey((audio.find(isDefault) ?? audio[0]).stream.tags?.language);
  const audioTracks: RemuxAudioTrack[] = chosen.map(({ entry, copy }) => ({
    audioIndex: entry.audioIndex,
    copy,
    channels: entry.stream.channels ?? null,
    language: entry.stream.tags?.language ?? null,
    title: entry.stream.tags?.title ?? null,
    isDefault: languageKey(entry.stream.tags?.language) === defaultLanguage,
  }));
  const subtitles: RemuxSubtitleTrack[] = streams
    .filter(stream => stream.codec_type === 'subtitle')
    .flatMap((stream, subtitleIndex) => {
      const kind = SUBTITLE_KINDS[stream.codec_name ?? ''];
      if (!kind) return [];
      return [
        {
          subtitleIndex,
          kind,
          codec: stream.codec_name!,
          language: stream.tags?.language ?? null,
          title: stream.tags?.title ?? null,
          isDefault: stream.disposition?.default === 1,
          forced: stream.disposition?.forced === 1,
          hearingImpaired: stream.disposition?.hearing_impaired === 1,
        },
      ];
    });
  return { videoCodec: video.codec_name!, durationSeconds, audio: audioTracks, subtitles };
}

/** The delivery of a file played through its remux: its audio tracks are the remux's own. */
export function remuxDelivery(
  delivery: PlaybackDelivery,
  plan: RemuxPlan,
  probe: ProbeResult
): PlaybackDelivery {
  const sourceAudio = (probe.streams ?? []).filter(stream => stream.codec_type === 'audio');
  const audioTracks: PlaybackAudioTrack[] = plan.audio.map((track, index) => ({
    index,
    language: track.language,
    title: track.title,
    codec: track.copy ? (sourceAudio[track.audioIndex]?.codec_name ?? null) : 'ac3',
    channels: track.copy ? track.channels : Math.min(track.channels ?? 2, 6),
    isDefault: track.isDefault,
    canPlayDirect: true,
  }));
  const defaultAudioTrackIndex = Math.max(
    0,
    audioTracks.findIndex(track => track.isDefault)
  );
  return {
    ...delivery,
    mode: 'remux',
    transcodeVideo: false,
    audioCodec: audioTracks[defaultAudioTrackIndex]?.codec ?? null,
    mimeType: 'application/vnd.apple.mpegurl',
    audioTracks,
    defaultAudioTrackIndex,
  };
}

/**
 * Whether a remux can stand in for this delivery: converted audio whose video plays as it is
 * (the remux copies the video; converted video means the client cannot decode it).
 */
export function remuxReplaces(
  delivery: PlaybackDelivery | undefined
): delivery is PlaybackDelivery {
  return delivery?.mode === 'audio-transcode' && !delivery.transcodeVideo;
}

/** Whether a remux plays from `startSeconds`: finished, or built far enough past it. */
export function remuxPlayable(status: RemuxStatus, startSeconds = 0): boolean {
  if (status.state === 'complete') return true;
  return (
    status.state === 'running' &&
    status.readySeconds >= Math.min(status.durationSeconds, startSeconds + READY_AHEAD_SECONDS)
  );
}

export interface RemuxRequest {
  status: RemuxStatus;
  plan: RemuxPlan;
  probe: ProbeResult;
}

/**
 * Decides which files a TV gets a remux of (HLS with audio it decodes, built once by media-load
 * in the background) and asks for them: a viewer waiting first, the next episode of a show being
 * watched after.
 */
export class TvRemuxService {
  /** Prefetched files waiting for their download to finish, with the next check. */
  private readonly waiting = new Map<string, ReturnType<typeof setTimeout> | null>();
  private closed = false;

  constructor(
    private readonly mediaLoad: Pick<
      MediaLoadClientService,
      'getRemuxStatus' | 'isFileComplete' | 'onRemuxChanged' | 'requestRemux'
    >,
    private readonly audio: Pick<AudioPlaybackService, 'knownProbe' | 'probeFile'>
  ) {}

  /** A file's remux when it has one, with its plan; null when it needs none or has none yet. */
  async existing(target: PlaybackTarget): Promise<RemuxRequest | null> {
    const probe = await this.audio.knownProbe(target).catch(() => null);
    const plan = probe && remuxPlan(probe);
    if (!probe || !plan) return null;
    const status = await this.mediaLoad
      .getRemuxStatus(target.source.id, target.filePath)
      .catch(() => null);
    return status && status.state !== 'failed' ? { status, plan, probe } : null;
  }

  /** A file's remux status, or null when it has none (or media-load cannot be asked). */
  async status(sourceId: number, filePath: string): Promise<RemuxStatus | null> {
    return this.mediaLoad.getRemuxStatus(sourceId, filePath).catch(() => null);
  }

  /**
   * Ask for a file's remux (or raise its priority). Null when the file is not probed yet, needs
   * no remux, or media-load cannot build one (an older service).
   */
  async request(target: PlaybackTarget, priority: RemuxPriority): Promise<RemuxRequest | null> {
    const probe = await this.audio.knownProbe(target).catch(() => null);
    return probe ? this.requestFor(target, probe, priority) : null;
  }

  private async requestFor(
    target: PlaybackTarget,
    probe: ProbeResult,
    priority: RemuxPriority
  ): Promise<RemuxRequest | null> {
    const plan = remuxPlan(probe);
    if (!plan) return null;
    try {
      const status = await this.mediaLoad.requestRemux(target, plan, priority);
      return { status, plan, probe };
    } catch (error) {
      logger.debug('TvRemuxService', `No remux for source ${target.source.id}`, error);
      return null;
    }
  }

  /**
   * Remux a prefetched next episode once its download finishes, if it needs one, so it plays
   * natively when the viewer gets to it. Checked every minute for three hours.
   */
  requestWhenDownloaded(target: PlaybackTarget): void {
    const key = `${target.source.id}:${target.filePath}`;
    if (this.waiting.has(key)) return;
    let polls = 0;
    const check = async (): Promise<boolean> => {
      if (await this.mediaLoad.isFileComplete(target.source.id, target.filePath)) {
        await this.requestFor(target, await this.audio.probeFile(target), 'next');
        return true;
      }
      return ++polls >= DOWNLOAD_POLL_LIMIT;
    };
    const run = () => {
      void check()
        .catch(error => {
          logger.debug('TvRemuxService', 'Next-episode remux check failed', error);
          return ++polls >= DOWNLOAD_POLL_LIMIT;
        })
        .then(done => {
          if (done || this.closed) {
            this.waiting.delete(key);
            return;
          }
          const timer = setTimeout(run, DOWNLOAD_POLL_MS);
          timer.unref?.();
          this.waiting.set(key, timer);
        });
    };
    this.waiting.set(key, null);
    run();
  }

  /** Hear remuxes progress and finish; returns the unsubscribe function. */
  onChange(listener: (status: RemuxStatus) => void, onResync?: () => void): () => void {
    try {
      return this.mediaLoad.onRemuxChanged(status => {
        if (status.state === 'running' || status.state === 'complete') listener(status);
      }, onResync);
    } catch (error) {
      logger.debug('TvRemuxService', 'Remux events are unavailable', error);
      return () => undefined;
    }
  }

  close(): void {
    this.closed = true;
    for (const timer of this.waiting.values()) if (timer) clearTimeout(timer);
    this.waiting.clear();
  }
}

/** Segments AVPlay buffers from the end of an unfinished playlist before it plays. */
const LIVE_START_SEGMENTS = 3;

/**
 * The playlist of a remux being built, cut so AVPlay starts at `startSeconds`. AVPlay plays an
 * unfinished playlist as live, from three segments before its end, and ignores `EXT-X-START`:
 * listed up to two segments past the one at `startSeconds`, it starts at that segment and fetches
 * only what it is about to play. Its reloads get the whole playlist and carry on. A finished
 * playlist, or a start past the listed segments, is left as it is.
 */
export function playlistStartingAt(playlist: string, startSeconds: number): string {
  const lines = playlist.split('\n');
  if (lines.some(line => line.trim() === '#EXT-X-ENDLIST')) return playlist;
  const kept: string[] = [];
  let duration: number | null = null;
  let segmentStart = 0;
  let index = -1;
  let startIndex: number | null = null;
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      duration = Number.parseFloat(line.slice('#EXTINF:'.length));
      kept.push(line);
      continue;
    }
    if (duration !== null && line && !line.startsWith('#')) {
      index += 1;
      if (startIndex === null && startSeconds < segmentStart + duration) startIndex = index;
      if (startIndex !== null && index >= startIndex + LIVE_START_SEGMENTS) {
        kept.pop();
        break;
      }
      segmentStart += duration;
      duration = null;
    }
    kept.push(line);
  }
  if (startIndex === null) return playlist;
  return `${kept.join('\n').trimEnd()}\n`;
}

/** How long a playback is remembered to have opened its remux playlist. */
const OPENED_PLAYLIST_MS = 6 * 60 * 60_000;

/**
 * Which playbacks (by streaming key) are still opening their remux: AVPlay picks where it starts
 * from the playlists it reads before its first segment (it reads two as it opens, and starts from
 * the second), so those are cut where the viewer is; once it asks for a segment, it has started.
 */
export class OpenedPlaylists {
  private readonly playbacks = new Map<string, { openedAt: number; started: boolean }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Whether `key`'s playlist is cut where it starts: until it asks for its first segment. */
  cut(key: string): boolean {
    return !this.playback(key).started;
  }

  /** `key` asked for a segment: its start is chosen, and later playlists are whole. */
  segmentRequested(key: string): void {
    this.playback(key).started = true;
  }

  private playback(key: string): { openedAt: number; started: boolean } {
    const now = this.now();
    for (const [other, playback] of this.playbacks)
      if (playback.openedAt + OPENED_PLAYLIST_MS <= now) this.playbacks.delete(other);
    let playback = this.playbacks.get(key);
    if (!playback) {
      playback = { openedAt: now, started: false };
      this.playbacks.set(key, playback);
    }
    return playback;
  }
}
