import { type Painter, remPx } from '../gl/art';
import { color, typeScale } from '../tokens';
import type { MessageTone } from './Message';
import { messageMetrics } from './message.metrics';

import dangerSvg from '~icons/mdi/alert-circle-outline?raw';
import warningSvg from '~icons/mdi/alert-outline?raw';
import successSvg from '~icons/mdi/check-circle-outline?raw';
import infoSvg from '~icons/mdi/information-outline?raw';

const ICONS: Record<MessageTone, string> = {
  info: infoSvg,
  success: successSvg,
  warning: warningSvg,
  danger: dangerSvg,
};

/**
 * An icon's path data (24 × 24), from the same SVG Message renders. A loop, not `matchAll`
 * (Chromium 69 lacks it).
 */
function iconPaths(tone: MessageTone) {
  const pattern = /\sd="([^"]+)"/g;
  const paths: string[] = [];
  for (let match = pattern.exec(ICONS[tone]); match; match = pattern.exec(ICONS[tone]))
    paths.push(match[1]);
  return paths;
}

export interface MessageArtProps {
  tone: MessageTone;
  /** The body (no title): one line, or `maxLines` wrapped. */
  text: string;
  maxLines?: number;
}

/**
 * An inline Message without a title at (`x`, `middle`), its first line centred on `middle`: the
 * tone's icon in its colour, then the text. `width`: the room for both (px).
 */
export function paintMessage(
  painter: Painter,
  { tone, text, maxLines = 2 }: MessageArtProps,
  x: number,
  middle: number,
  width: number
) {
  const icon = remPx(messageMetrics.iconSize);
  const line = remPx(messageMetrics.lineHeight);
  const top = middle - line / 2;
  const tint = messageMetrics.tones[tone];
  const px = Math.ceil(icon * 2);
  painter.canvas(
    `message-icon|${tone}|${px}`,
    px,
    px,
    context => {
      context.scale(px / 24, px / 24);
      context.fillStyle = tint;
      for (const path of iconPaths(tone)) context.fill(new Path2D(path));
    },
    x,
    top + (line - icon) / 2,
    icon,
    icon
  );
  const textX = x + icon + remPx(messageMetrics.iconGap);
  painter.text(
    {
      text,
      size: remPx(typeScale.body.fontSize),
      weight: typeScale.body.fontWeight,
      lineHeight: parseFloat(typeScale.body.lineHeight),
      color: color.text,
      maxWidth: Math.max(1, width - (textX - x)),
      maxLines,
    },
    textX,
    top
  );
}
