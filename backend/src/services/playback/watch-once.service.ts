import type { ClaimRequest, StorageRemovalResult } from '@miauwatch/service-contracts';

import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';
import { isVideoFile } from '@services/source/video-files';

import type { AudioPlaybackService } from './audio-playback.service';
import type { PlaybackTarget } from './playback-target';

/** A file that cannot be admitted for watch-once playback; the caller releases and tries another. */
export class WatchOnceRejectedError extends Error {}

export interface WatchOnceServiceOptions {
  mediaLoad: Pick<
    MediaLoadClientService,
    'getMediaFiles' | 'isFileComplete' | 'predownload' | 'removeStorageWithResult'
  >;
  audio: Pick<AudioPlaybackService, 'probeFresh'>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  intervalMs?: number;
  maxReleaseRetries?: number;
}

/** Waits for a whole, real video before watch-once playback, then releases storage on request. */
export class WatchOnceService {
  private readonly mediaLoad: WatchOnceServiceOptions['mediaLoad'];
  private readonly audio: WatchOnceServiceOptions['audio'];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly intervalMs: number;
  private readonly maxReleaseRetries: number;

  constructor(options: WatchOnceServiceOptions) {
    this.mediaLoad = options.mediaLoad;
    this.audio = options.audio;
    this.sleep =
      options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 600_000;
    this.intervalMs = options.intervalMs ?? 1_000;
    this.maxReleaseRetries = options.maxReleaseRetries ?? 30;
  }

  /** Claim the whole file before polling, so pieces beyond the warmup range keep downloading. */
  async claim(target: PlaybackTarget, ownerKey: string): Promise<void> {
    const claim: ClaimRequest = { kind: 'watched', ownerKey, ttlMs: null };
    await this.mediaLoad.predownload(target, claim);
  }

  /** A season pack shares one storage record across several video files; keep it intact. */
  async hasSiblingVideoFiles(sourceId: number): Promise<boolean> {
    const layout = await this.mediaLoad.getMediaFiles({
      source: { id: sourceId },
      filePath: '',
      matchKind: 'movie',
    } as PlaybackTarget);
    return layout.files.filter(file => isVideoFile(file.path)).length > 1;
  }

  /** Reject unless the file is a complete, probed video. */
  async verify(target: PlaybackTarget): Promise<void> {
    if (!isVideoFile(target.filePath))
      throw new WatchOnceRejectedError(`Not a video file: ${target.filePath}`);
    const deadline = this.now() + this.timeoutMs;
    for (;;) {
      if (this.now() >= deadline) throw new WatchOnceRejectedError('File download timed out.');
      if (await this.mediaLoad.isFileComplete(target.source.id, target.filePath)) break;
      await this.sleep(this.intervalMs);
    }
    const probe = await this.audio.probeFresh(target);
    if (!probe.streams?.some(stream => stream.codec_type === 'video'))
      throw new WatchOnceRejectedError(`No video stream: ${target.filePath}`);
  }

  /** Remove source storage once viewers stop streaming it, or give up with the last outcome. */
  async release(sourceId: number): Promise<StorageRemovalResult> {
    // ponytail: bounded wait — at most maxReleaseRetries sleeps (30 s at defaults), then return
    // the last result; add a stream-close notification if release ever must wait longer.
    for (let attempt = 0; ; attempt++) {
      const result = await this.mediaLoad.removeStorageWithResult(sourceId);
      if (result.status !== 'active_playback' || attempt >= this.maxReleaseRetries) return result;
      await this.sleep(this.intervalMs);
    }
  }
}
