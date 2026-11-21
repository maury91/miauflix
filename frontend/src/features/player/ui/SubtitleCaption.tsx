import * as styles from './subtitleCaption.css';

/**
 * The current subtitle line, drawn by the player itself rather than the browser's caption
 * renderer, so it can sit low, without a box, and step above the controls while they are open.
 * `raise` is the height in pixels the open controls take at the bottom, 0 while hidden.
 * `fontFamily` is a loaded face the release ships for its subtitles.
 */
export function SubtitleCaption({
  text,
  raise,
  fontFamily,
  'data-testid': testId,
}: {
  text: string;
  raise: number;
  fontFamily?: string;
  'data-testid'?: string;
}) {
  return (
    <div
      className={styles.caption}
      // Per frame of the controls' slide and per release: inline, never a generated class
      style={{
        bottom: raise > 0 ? `calc(${raise}px + ${styles.CONTROLS_GAP})` : styles.EDGE_GAP,
        fontFamily: fontFamily ? `'${fontFamily}', sans-serif` : undefined,
      }}
      aria-live="off"
      data-testid={testId}
    >
      {text}
    </div>
  );
}
