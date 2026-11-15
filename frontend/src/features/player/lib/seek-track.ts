import type { SeekRange } from '@shared/design-system';

/** Downloaded stretches of the played file, `[start, end)` in thousandths of the file. */
export type DownloadedRanges = ReadonlyArray<readonly [number, number]>;

/**
 * The downloaded stretches as the seek bar's blocks: shares of the file, 0 to 1, clamped, with
 * empty stretches left out. Null (nothing reports downloads) draws no blocks.
 */
export function downloadedBlocks(ranges: DownloadedRanges | null | undefined): SeekRange[] {
  const blocks: SeekRange[] = [];
  for (const [start, end] of ranges ?? []) {
    const from = Math.max(0, start) / 1000;
    const to = Math.min(1000, end) / 1000;
    if (to > from) blocks.push({ start: from, end: to });
  }
  return blocks;
}
