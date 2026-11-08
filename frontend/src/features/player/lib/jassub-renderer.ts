/**
 * JASSUB (libass in WebAssembly), loaded on demand: only the browser build imports this module,
 * and only once a styled subtitle is picked.
 */
import JASSUB from 'jassub';
import defaultFontUrl from 'jassub/dist/default.woff2?url';
import wasmWorkerUrl from 'jassub/dist/wasm/jassub-worker.js?url';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import modernWasmWorkerUrl from 'jassub/dist/wasm/jassub-worker-modern.js?url';
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import workerUrl from 'jassub/dist/worker/worker.js?worker&url';

export interface AssRenderer {
  /** Add `Dialogue` lines to the loaded track. */
  addEvents(lines: string): void;
  /** Add attached fonts; text already drawn in the fallback face switches to them. */
  addFonts(fonts: Uint8Array[]): Promise<void>;
  /** Seconds added to the subtitle clock: the player's subtitle delay, negated. */
  setTimeOffset(seconds: number): void;
  destroy(): void;
}

/** Weak devices render at 720p: libass cost grows with the canvas, not the video. */
function maxRenderHeight(): number {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? Infinity;
  return memory <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2 ? 720 : 1080;
}

export async function createAssRenderer(
  video: HTMLVideoElement,
  track: string,
  timeOffset: number
): Promise<AssRenderer> {
  const instance = new JASSUB({
    video,
    subContent: track,
    // Attached fonts are added as they download (`addFonts`), so nothing waits for them.
    // The bundled fallback face for styles whose font the release does not ship.
    availableFonts: { 'liberation sans': defaultFontUrl },
    defaultFont: 'liberation sans',
    // Local font access prompts for a permission; remote lookups would leak titles to Google.
    queryFonts: false,
    timeOffset,
    maxRenderHeight: maxRenderHeight(),
    workerUrl,
    wasmUrl,
    wasmWorkerUrl,
    modernWasmUrl,
    modernWasmWorkerUrl,
  });
  try {
    await instance.ready;
  } catch (error) {
    void instance.destroy();
    throw error;
  }
  return {
    addEvents: lines => void instance.renderer.processData(lines),
    addFonts: async fonts => {
      if (!fonts.length) return;
      await instance.renderer.addFonts(fonts);
      // libass picks the new faces on the next frame; a paused video needs one drawn now.
      if (video.paused) await instance.resize(true);
    },
    setTimeOffset: seconds => {
      instance.timeOffset = seconds;
      void instance.resize(true);
    },
    destroy: () => void instance.destroy(),
  };
}
