/** A stretch of the timeline as shares of it, 0 to 1. */
export interface SeekRange {
  start: number;
  end: number;
}

/**
 * The downloaded stretches of a file from its piece bitfield (one flag per piece, in order), as
 * shares of the whole: consecutive pieces merge into one range, so a mostly downloaded file draws
 * a few blocks instead of thousands.
 */
export function piecesToRanges(pieces: ArrayLike<boolean | number>): SeekRange[] {
  const count = pieces.length;
  const ranges: SeekRange[] = [];
  let start = -1;
  for (let index = 0; index <= count; index++) {
    const have = index < count && Boolean(pieces[index]);
    if (have && start === -1) start = index;
    else if (!have && start !== -1) {
      ranges.push({ start: start / count, end: index / count });
      start = -1;
    }
  }
  return ranges;
}
