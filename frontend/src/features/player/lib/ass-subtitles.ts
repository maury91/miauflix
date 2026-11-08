import type { SubtitleFontListResponse } from '@miauflix/backend';
import { API_CREDENTIALS } from '@shared/config/constants';
import { useEffect, useRef, useState } from 'react';

import type { AssRenderer } from './jassub-renderer';

/** Never part of the TV bundle, which inlines dynamic imports. */
const loadRenderer = __TIZEN_BUILD__ ? null : () => import('./jassub-renderer');

export interface AssCue {
  start: number;
  end: number;
  text: string;
}

/**
 * Whether this browser can run the ASS renderer (libass in a worker, drawing to an offscreen
 * canvas). Never in the TV build, which keeps WebVTT captions.
 */
export function assRendererSupported(): boolean {
  return (
    !__TIZEN_BUILD__ &&
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof WebAssembly !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'transferControlToOffscreen' in HTMLCanvasElement.prototype
  );
}

function parseTime(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})$/);
  if (!match) return null;
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4].padEnd(3, '0')) / 1000
  );
}

/** The `Dialogue` lines of an ASS document, and the `[Events]` field order they follow. */
export function assEvents(body: string): { format: string[]; lines: string[] } {
  let format: string[] = [];
  let inEvents = false;
  const lines: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) inEvents = line.toLowerCase() === '[events]';
    else if (inEvents && /^format\s*:/i.test(line))
      format = line
        .slice(line.indexOf(':') + 1)
        .split(',')
        .map(field => field.trim().toLowerCase());
    else if (inEvents && /^dialogue\s*:/i.test(line)) lines.push(line);
  }
  return { format, lines };
}

/**
 * Plain text and times of dialogue lines, for the subtitle timing list. Override tags are
 * removed and vector drawings (`\p1`) skipped: they are shapes, not words.
 */
export function assCues(format: string[], lines: string[]): AssCue[] {
  const start = format.indexOf('start');
  const end = format.indexOf('end');
  const text = format.indexOf('text');
  if (start < 0 || end < 0 || text < 0) return [];
  return lines.flatMap(line => {
    const fields = line.slice(line.indexOf(':') + 1).split(',');
    const from = parseTime(fields[start] ?? '');
    const to = parseTime(fields[end] ?? '');
    const raw = fields.slice(text).join(',');
    if (from === null || to === null || /\{[^}]*\\p[1-9]/.test(raw)) return [];
    const plain = raw
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\[Nn]/g, '\n')
      .replace(/\\h/g, ' ')
      .trim();
    return plain ? [{ start: from, end: to, text: plain }] : [];
  });
}

const FONT_CONCURRENCY = 3;

/**
 * Download the release's attached fonts, handing each to `onFont` as it arrives. Failures leave
 * the renderer on its fallback face.
 */
async function loadFonts(
  trackUrl: string,
  query: string,
  signal: AbortSignal,
  onFont: (font: Uint8Array) => void
): Promise<void> {
  const response = await fetch(`${trackUrl}/fonts?${query}`, {
    credentials: API_CREDENTIALS,
    signal,
  });
  if (!response.ok) return;
  const { fonts } = (await response.json()) as SubtitleFontListResponse;
  const queue = [...fonts];
  const next = async (): Promise<void> => {
    const font = queue.shift();
    if (!font) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      const file = await fetch(`${trackUrl}/fonts/${font.id}?${query}`, {
        credentials: API_CREDENTIALS,
        signal,
      });
      if (file.ok) {
        const data = new Uint8Array(await file.arrayBuffer());
        signal.throwIfAborted();
        onFont(data);
        break;
      }
      // Requests are rate limited per second; a large release can trip it.
      if (file.status !== 429) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return next();
  };
  await Promise.all(Array.from({ length: FONT_CONCURRENCY }, () => next().catch(() => {})));
}

interface Options {
  video: HTMLVideoElement | null;
  /** `/api/subtitles/tracks/:id`, or null when no styled track is selected. */
  trackUrl: string | null;
  streamingKey: string;
  /** Embedded tracks are read in windows; sidecars arrive whole. */
  windowed: boolean;
  windowStart: number;
  /** The player's subtitle delay, in seconds. */
  offset: number;
  onCues: (cues: AssCue[]) => void;
  onError: () => void;
}

/**
 * Render a styled track with libass over the video: signs, positioning, karaoke and the fonts
 * the release ships. Returns whether the renderer is drawing.
 */
export function useAssSubtitles({
  video,
  trackUrl,
  streamingKey,
  windowed,
  windowStart,
  offset,
  onCues,
  onError,
}: Options): boolean {
  const [active, setActive] = useState(false);
  const renderer = useRef<AssRenderer | null>(null);
  const seen = useRef(new Set<string>());
  const loadedWindows = useRef(new Set<number>());
  const format = useRef<string[]>([]);
  const cues = useRef<AssCue[]>([]);
  const firstWindow = useRef(windowStart);
  firstWindow.current = windowStart;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const callbacks = useRef({ onCues, onError });
  callbacks.current = { onCues, onError };

  const query = `streamingKey=${encodeURIComponent(streamingKey)}`;
  const windowUrl = (start: number) =>
    `${trackUrl}?${query}&format=ass${windowed ? `&start=${start}` : ''}`;

  const addLines = (lines: string[]) => {
    const fresh = lines.filter(line => !seen.current.has(line));
    for (const line of fresh) seen.current.add(line);
    if (fresh.length) {
      cues.current = [...cues.current, ...assCues(format.current, fresh)].sort(
        (left, right) => left.start - right.start
      );
      callbacks.current.onCues(cues.current);
    }
    return fresh;
  };

  // One renderer per video and track. It draws as soon as the first window is in, with the
  // fallback face; each attached font replaces it as soon as it downloads.
  useEffect(() => {
    setActive(false);
    seen.current = new Set();
    loadedWindows.current = new Set();
    cues.current = [];
    if (!video || !trackUrl || !loadRenderer || !assRendererSupported()) return;
    const controller = new AbortController();
    let created: AssRenderer | null = null;
    const start = firstWindow.current;
    loadedWindows.current.add(start);
    // Fonts that arrive before the renderer is up wait here.
    const pendingFonts: Uint8Array[] = [];
    const addFont = (font: Uint8Array) => {
      if (created) void created.addFonts([font]);
      else pendingFonts.push(font);
    };
    void loadFonts(trackUrl, query, controller.signal, addFont).catch(() => {
      // The fallback face keeps rendering.
    });
    (async () => {
      const [body, module] = await Promise.all([
        fetch(windowUrl(start), { credentials: API_CREDENTIALS, signal: controller.signal }).then(
          response => {
            if (!response.ok) throw new Error(`Subtitle request failed: ${response.status}`);
            return response.text();
          }
        ),
        loadRenderer(),
      ]);
      controller.signal.throwIfAborted();
      const events = assEvents(body);
      format.current = events.format;
      addLines(events.lines);
      const instance = await module.createAssRenderer(video, body, -offsetRef.current);
      if (controller.signal.aborted) {
        instance.destroy();
        return;
      }
      created = instance;
      if (pendingFonts.length) void instance.addFonts(pendingFonts.splice(0));
      renderer.current = created;
      setActive(true);
    })().catch(() => {
      if (!controller.signal.aborted) callbacks.current.onError();
    });
    return () => {
      controller.abort();
      created?.destroy();
      renderer.current = null;
      setActive(false);
    };
    // Windows and offsets are applied by the effects below, without a new renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, trackUrl, query, windowed]);

  // Later windows add only the events not already loaded.
  useEffect(() => {
    if (!active || !windowed || !trackUrl || loadedWindows.current.has(windowStart)) return;
    loadedWindows.current.add(windowStart);
    const controller = new AbortController();
    fetch(windowUrl(windowStart), { credentials: API_CREDENTIALS, signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`Subtitle request failed: ${response.status}`);
        const fresh = addLines(assEvents(await response.text()).lines);
        if (fresh.length && !controller.signal.aborted)
          renderer.current?.addEvents(fresh.join('\n'));
      })
      .catch(() => {
        // The next visit to this window tries again; the loaded events keep rendering.
        loadedWindows.current.delete(windowStart);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, windowStart]);

  useEffect(() => {
    renderer.current?.setTimeOffset(-offset);
  }, [offset, active]);

  return active;
}
