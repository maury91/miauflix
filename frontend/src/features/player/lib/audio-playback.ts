interface AudioPlaybackOptions {
  video: HTMLVideoElement;
  url: string;
  mimeType: string;
  durationSeconds: number;
  startSeconds: number;
  autoplay: boolean;
  audioTrackIndex?: number;
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
    while (!signal.aborted) {
      // Limit media-buffer memory and stop pulling the network when paused with a full buffer.
      while (
        positioned &&
        buffer.buffered.length &&
        buffer.buffered.end(buffer.buffered.length - 1) - video.currentTime > 60
      ) {
        await waitForConsumption(signal);
      }
      const next = await reader.read();
      if (next.done) break;
      if (
        positioned &&
        video.currentTime > 30 &&
        buffer.buffered.length &&
        buffer.buffered.start(0) < video.currentTime - 30
      ) {
        await updateBuffer(buffer, signal, () => buffer.remove(0, video.currentTime - 30));
      }
      const bytes = new Uint8Array(next.value).buffer;
      await updateBuffer(buffer, signal, () => buffer.appendBuffer(bytes));
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
