interface AudioPlaybackOptions {
  video: HTMLVideoElement;
  url: string;
  mimeType: string;
  durationSeconds: number;
  startSeconds: number;
  autoplay: boolean;
  audioTrackIndex?: number;
  copyAudio?: boolean;
  transcodeVideo?: boolean;
  onReady: () => void;
  onError: (message: string) => void;
}

function aborted() {
  return new DOMException('Playback cancelled', 'AbortError');
}

function updateBuffer(buffer: SourceBuffer, signal: AbortSignal, operation: () => void) {
  return new Promise<void>((resolve, reject) => {
    const clean = () => {
      buffer.removeEventListener('updateend', complete);
      buffer.removeEventListener('error', failed);
      signal.removeEventListener('abort', cancel);
    };
    const complete = () => {
      clean();
      resolve();
    };
    const failed = () => {
      clean();
      reject(new Error('Converted audio could not be decoded.'));
    };
    const cancel = () => {
      clean();
      reject(aborted());
    };
    if (signal.aborted) {
      reject(aborted());
      return;
    }
    buffer.addEventListener('updateend', complete, { once: true });
    buffer.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', cancel, { once: true });
    try {
      operation();
    } catch (error) {
      clean();
      reject(error);
    }
  });
}

function waitForConsumption(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, 250);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

/** Seconds kept buffered behind the playhead; older media is evicted to make room. */
const KEEP_BEHIND_SECONDS = 30;
/** Seconds read ahead of the playhead before the network read pauses. */
export const MAX_AHEAD_SECONDS = 60;
/** The ahead limit never shrinks below this, even on high-bitrate files. */
export const MIN_AHEAD_SECONDS = 10;

function isQuotaExceeded(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}

function secondsAhead(buffer: SourceBuffer, video: HTMLVideoElement): number {
  return buffer.buffered.length
    ? buffer.buffered.end(buffer.buffered.length - 1) - video.currentTime
    : 0;
}

/** Failed retries in a row, with neither the playhead nor the buffer start moving, before giving up. */
export const MAX_STALLED_RETRIES = 8;

function bufferStart(buffer: SourceBuffer): number {
  return buffer.buffered.length ? buffer.buffered.start(0) : 0;
}

/** Shared between appends: the ahead limit shrinks when the browser's byte quota is hit. */
export interface BufferBudget {
  maxAheadSeconds: number;
}

/**
 * Append a chunk, making room when the browser's media buffer is full. The buffer limit is in
 * bytes (about 150 MB of video in Chrome) while reading ahead is limited in seconds, so on a
 * high-bitrate file even MAX_AHEAD_SECONDS can overflow it. On QuotaExceededError: evict what
 * is behind the playhead, lower the ahead limit to what fit, wait for playback to consume, and
 * retry. Before playback starts there is nothing to consume, so the error stands. While paused it
 * waits for playback to resume; if playback runs but neither the playhead nor eviction moves for
 * MAX_STALLED_RETRIES retries, the buffer will never drain and the error is reported.
 */
export async function appendWithinQuota(
  buffer: SourceBuffer,
  video: HTMLVideoElement,
  bytes: ArrayBuffer,
  signal: AbortSignal,
  budget: BufferBudget,
  playing: boolean
): Promise<void> {
  let stalled = 0;
  let lastTime = video.currentTime;
  let lastStart = bufferStart(buffer);
  for (;;) {
    try {
      await updateBuffer(buffer, signal, () => buffer.appendBuffer(bytes));
      return;
    } catch (error) {
      if (!playing || !isQuotaExceeded(error)) throw error;
    }
    const behind = video.currentTime - 1;
    if (buffer.buffered.length && buffer.buffered.start(0) < behind) {
      await updateBuffer(buffer, signal, () => buffer.remove(0, behind));
    }
    budget.maxAheadSeconds = Math.max(
      MIN_AHEAD_SECONDS,
      Math.min(budget.maxAheadSeconds, secondsAhead(buffer, video)) * 0.75
    );
    // Always let playback move on once, so a retry has something new to evict.
    do {
      await waitForConsumption(signal);
    } while (video.paused || secondsAhead(buffer, video) > budget.maxAheadSeconds);
    // A seek also counts as progress: it moves the playhead and frees what is behind it.
    const progressed = video.currentTime !== lastTime || bufferStart(buffer) !== lastStart;
    stalled = progressed ? 0 : stalled + 1;
    if (stalled >= MAX_STALLED_RETRIES) {
      throw new Error('The media buffer is full and playback is not advancing. Retry playback.');
    }
    lastTime = video.currentTime;
    lastStart = bufferStart(buffer);
  }
}

/** Native MSE keeps a sparse, full-movie timeline while FFmpeg restarts on each seek. */
export function startAudioPlayback(options: AudioPlaybackOptions): () => void {
  const { video, mimeType, durationSeconds, startSeconds, autoplay, onReady, onError } = options;
  const controller = new AbortController();
  const { signal } = controller;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let objectUrl: string | undefined;

  const run = async () => {
    if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(mimeType)) {
      throw new Error('This browser cannot play the converted audio and selected video.');
    }
    video.pause();
    const media = new MediaSource();
    objectUrl = URL.createObjectURL(media);
    const opened = new Promise<void>((resolve, reject) => {
      const clean = () => {
        media.removeEventListener('sourceopen', open);
        signal.removeEventListener('abort', cancel);
      };
      const open = () => {
        clean();
        resolve();
      };
      const cancel = () => {
        clean();
        reject(aborted());
      };
      media.addEventListener('sourceopen', open, { once: true });
      signal.addEventListener('abort', cancel, { once: true });
    });
    video.src = objectUrl;
    await opened;
    if (signal.aborted) throw aborted();
    media.duration = durationSeconds;
    const buffer = media.addSourceBuffer(mimeType);
    const url = new URL(options.url, window.location.href);
    url.searchParams.set('start', String(startSeconds));
    if (options.audioTrackIndex !== undefined)
      url.searchParams.set('audioTrack', String(options.audioTrackIndex));
    url.searchParams.set('audioCopy', String(options.copyAudio === true));
    if (options.transcodeVideo) url.searchParams.set('transcodeVideo', 'true');
    const response = await fetch(url, { signal, credentials: 'include' });
    if (!response.ok || !response.body) {
      const failure = (await response.json().catch(() => null)) as { error?: unknown } | null;
      throw new Error(
        typeof failure?.error === 'string'
          ? failure.error
          : 'Audio conversion could not start. Retry playback.'
      );
    }
    const offsetHeader = response.headers.get('X-Playback-Timestamp-Offset');
    const offset = offsetHeader === null ? NaN : Number(offsetHeader);
    if (!Number.isFinite(offset))
      throw new Error('Converted audio has no usable playback timeline.');
    buffer.timestampOffset = offset;
    reader = response.body.getReader();
    let positioned = false;
    const budget: BufferBudget = { maxAheadSeconds: MAX_AHEAD_SECONDS };
    while (!signal.aborted) {
      // Limit media-buffer memory and stop pulling the network when paused with a full buffer.
      while (positioned && secondsAhead(buffer, video) > budget.maxAheadSeconds) {
        await waitForConsumption(signal);
      }
      const next = await reader.read();
      if (next.done) break;
      if (
        positioned &&
        video.currentTime > KEEP_BEHIND_SECONDS &&
        buffer.buffered.length &&
        buffer.buffered.start(0) < video.currentTime - KEEP_BEHIND_SECONDS
      ) {
        await updateBuffer(buffer, signal, () =>
          buffer.remove(0, video.currentTime - KEEP_BEHIND_SECONDS)
        );
      }
      const bytes = new Uint8Array(next.value).buffer;
      await appendWithinQuota(buffer, video, bytes, signal, budget, positioned);
      if (!positioned) {
        for (let range = 0; range < buffer.buffered.length; range++) {
          const beginning = buffer.buffered.start(range);
          const end = buffer.buffered.end(range);
          // Initial codec delay can put the first frame a few milliseconds after zero.
          const position = Math.max(startSeconds, beginning);
          if (beginning <= startSeconds + 0.15 && end > position) {
            video.currentTime = position;
            positioned = true;
            onReady();
            if (autoplay) void video.play().catch(() => undefined);
            break;
          }
        }
      }
    }
    if (signal.aborted) throw aborted();
    if (!positioned)
      throw new Error('The selected source could not provide the requested playback position.');
    if (media.readyState === 'open') {
      media.endOfStream();
    }
  };
  void run().catch(error => {
    if (!signal.aborted)
      onError(error instanceof Error ? error.message : 'Audio playback failed. Retry playback.');
    controller.abort();
    void reader?.cancel().catch(() => undefined);
  });
  return () => {
    controller.abort();
    void reader?.cancel().catch(() => undefined);
    if (objectUrl) {
      if (video.getAttribute('src') === objectUrl) {
        video.removeAttribute('src');
        video.load();
      }
      URL.revokeObjectURL(objectUrl);
    }
  };
}
