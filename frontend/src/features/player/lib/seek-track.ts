/** Downloaded stretches of the played file, `[start, end)` in thousandths of the file. */
export type DownloadedRanges = ReadonlyArray<readonly [number, number]>;

/** The bar's background, under the downloaded stretches and the watched part. */
export const SEEK_TRACK_COLOR = '#555';
/** Downloaded stretches. */
export const SEEK_DOWNLOADED_COLOR = '#bbb';
/** The whole bar when nothing reports downloads (the bar as it was before). */
export const SEEK_UNKNOWN_COLOR = '#aaa';

const CLEAR = 'rgba(0, 0, 0, 0)';
const pct = (value: number) => `${Math.round(value * 100) / 100}%`;

/**
 * The seek bar's layers, top first: the watched part (`progressColor`), the downloaded stretches,
 * and the gray track. Without ranges the track keeps its old light gray.
 */
export const seekTrackBackground = (
  percent: number,
  ranges: DownloadedRanges | null | undefined,
  progressColor: string
): { backgroundColor: string; backgroundImage: string } => {
  const layers = [
    `linear-gradient(to right, ${progressColor} ${pct(percent)}, ${CLEAR} ${pct(percent)})`,
  ];
  const stops: string[] = [];
  for (const [start, end] of ranges ?? []) {
    if (end <= start) continue;
    const from = pct(Math.max(0, start) / 10);
    const to = pct(Math.min(1000, end) / 10);
    stops.push(
      `${CLEAR} ${from}`,
      `${SEEK_DOWNLOADED_COLOR} ${from}`,
      `${SEEK_DOWNLOADED_COLOR} ${to}`,
      `${CLEAR} ${to}`
    );
  }
  if (stops.length) layers.push(`linear-gradient(to right, ${CLEAR} 0%, ${stops.join(', ')})`);
  return {
    backgroundColor: ranges ? SEEK_TRACK_COLOR : SEEK_UNKNOWN_COLOR,
    backgroundImage: layers.join(', '),
  };
};
