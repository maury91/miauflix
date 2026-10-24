/**
 * The hero's backdrop layers, bottom to top. A new backdrop fades in on top of whatever is on
 * screen, mid-fade layers included, so quickly changing titles crossfades forward instead of
 * flashing back to an older backdrop. Once a layer has fully faded in, the layers under it are
 * hidden and dropped.
 */
export interface StackedBackdrop<T> {
  /** Unique per layer: the same backdrop can be on the stack twice (A → B → A). */
  id: number;
  backdrop: T;
  /** False until the layer starts fading in. */
  visible: boolean;
}

/**
 * Layers kept at once; each is a full-width image to composite. Enough for the fades that overlap
 * while a held key changes the title every ~90ms (fades last 350ms).
 */
export const MAX_BACKDROP_LAYERS = 4;

/**
 * Put `backdrop` on top, fading in (or shown at once on an empty stack). A top layer that has
 * not started fading in is replaced: it is not on screen yet, so nothing visibly changes.
 */
export function pushBackdrop<T>(
  stack: ReadonlyArray<StackedBackdrop<T>>,
  backdrop: T,
  id: number
): StackedBackdrop<T>[] {
  if (!stack.length) return [{ id, backdrop, visible: true }];
  const shown = stack[stack.length - 1].visible ? [...stack] : stack.slice(0, -1);
  const next = [...shown, { id, backdrop, visible: false }];
  if (next.length <= MAX_BACKDROP_LAYERS) return next;
  // Over the cap, drop the oldest layer above the base. The base stays as the backdrop behind
  // every fade, and the newest layers carry the motion.
  return [next[0], ...next.slice(2)];
}

/** Start fading layer `id` in. */
export function revealBackdrop<T>(stack: ReadonlyArray<StackedBackdrop<T>>, id: number) {
  return stack.map(layer => (layer.id === id ? { ...layer, visible: true } : layer));
}

/** Layer `id` has fully faded in: drop the layers it now hides. */
export function settleBackdrop<T>(stack: ReadonlyArray<StackedBackdrop<T>>, id: number) {
  const index = stack.findIndex(layer => layer.id === id);
  return index <= 0 ? [...stack] : stack.slice(index);
}
