/** Something whose memory can be freed. */
export interface Evictable {
  /** When it was last used (a frame number); lower goes first. */
  lastUsed: number;
  bytes: number;
}

/**
 * Least recently used first, until the bytes in use are back to `target` × `budget`. Nothing goes
 * while within the budget, so a small overshoot doesn't free a little every frame.
 */
export function pickEvictions<T extends Evictable>(
  candidates: readonly T[],
  bytesInUse: number,
  budget: number,
  target = 0.9
): T[] {
  if (bytesInUse <= budget) return [];
  const picked: T[] = [];
  let bytes = bytesInUse;
  for (const candidate of [...candidates].sort((a, b) => a.lastUsed - b.lastUsed)) {
    if (bytes <= budget * target) break;
    picked.push(candidate);
    bytes -= candidate.bytes;
  }
  return picked;
}

/** Texture memory kept (bytes, RGBA); unused textures go first, least recently used. */
export const TEXTURE_BUDGET = 64 * 1024 * 1024;
