import styled from 'styled-components';

/** Gap between the caption and the screen bottom, or the controls when they are open. */
const EDGE_GAP = '6vh';
const CONTROLS_GAP = '1.5vh';

/**
 * Drawn by the player itself rather than the browser's caption renderer, so it can sit low,
 * without a box, and step above the controls while they are open.
 */
const Caption = styled.div<{ $raise: number; $fontFamily?: string }>`
  position: absolute;
  right: 0;
  bottom: ${({ $raise }) => ($raise > 0 ? `calc(${$raise}px + ${CONTROLS_GAP})` : EDGE_GAP)};
  left: 0;
  padding: 0 10%;
  color: #fff;
  ${({ $fontFamily }) => ($fontFamily ? `font-family: '${$fontFamily}', sans-serif;` : '')}
  font-size: 4.5vh;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  white-space: pre-line;
  /* An outline that keeps white text readable on bright scenes without hiding the picture */
  text-shadow:
    0 0 0.08em #000,
    0.06em 0.06em 0.06em #000,
    -0.06em -0.06em 0.06em #000,
    0.06em -0.06em 0.06em #000,
    -0.06em 0.06em 0.06em #000,
    0 0.08em 0.2em rgba(0, 0, 0, 0.8);
  pointer-events: none;
  transition: bottom 0.2s ease;
`;

/**
 * The current subtitle line.
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
    <Caption $raise={raise} $fontFamily={fontFamily} aria-live="off" data-testid={testId}>
      {text}
    </Caption>
  );
}
