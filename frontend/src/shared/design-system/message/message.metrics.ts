import { color, space, typeScale } from '../tokens';

/**
 * Message's numbers, shared by its CSS (message.css.ts) and its picture (message.art.ts). Lengths
 * are token strings (rem).
 */
export const messageMetrics = {
  /** The tone's icon, centred on the first body line. */
  iconSize: '1.25rem',
  iconGap: space.sm,
  /** One body line: the icon's box. */
  lineHeight: `${parseFloat(typeScale.body.fontSize) * parseFloat(typeScale.body.lineHeight)}rem`,
  tones: {
    info: color.info,
    success: color.success,
    warning: color.warning,
    danger: color.danger,
  },
} as const;
