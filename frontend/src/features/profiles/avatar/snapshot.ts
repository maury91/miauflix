import type { PlushieLook } from './look';
import { loadPlushies } from './runtime';

const SNAPSHOT_SIZE = 512;

/**
 * Draw a look once, off screen, as a PNG: the picture shown where live Plushies are too heavy.
 * Resolves null when the browser cannot draw it.
 */
export async function renderPlushieSnapshot(look: PlushieLook): Promise<Blob | null> {
  try {
    const { THREE, viewer } = await loadPlushies();
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-${SNAPSHOT_SIZE * 2}px;top:0;width:${SNAPSHOT_SIZE}px;height:${SNAPSHOT_SIZE}px;pointer-events:none;`;
    document.body.appendChild(host);
    const view = viewer.mountPlushie(host, THREE, { ...look, maxPixelRatio: 1 });
    try {
      // The viewer draws on the next animation frames; wait until a frame has landed.
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))
      );
      return await new Promise<Blob | null>(resolve => view.canvas.toBlob(resolve, 'image/png'));
    } finally {
      view.dispose();
      host.remove();
    }
  } catch {
    return null;
  }
}
