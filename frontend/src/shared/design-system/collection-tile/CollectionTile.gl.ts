import { type GlArt, hex, type Painter, remPx, type TextSpec } from '../gl';
import { color, focusRing, radius, scrim, space, typeScale } from '../tokens';

export const TILE_RATIO = { landscape: 9 / 16, portrait: 3 / 2, square: 1 } as const;
const FRAME = hex(color.surfaceRaised);
const OUTLINE = hex(color.focusOutline);
const TRACK = hex(color.borderSubtle);
const BRAND = hex(color.brand);
const SCRIM_FROM = hex('rgba(10, 13, 15, 0)');
// The last stop of scrim.tile
const SCRIM_TO = hex(/rgba\([^)]*\) 100%/.exec(scrim.tile)?.[0].replace(' 100%', '') ?? '#000');

export interface CollectionTileGlProps {
  label: string;
  supportingText?: string;
  ratio?: 'landscape' | 'portrait' | 'square';
  labelPlacement?: 'below' | 'overlay';
  labelHidden?: boolean;
  progress?: number;
  /** The tile's width (px); the frame's height follows the ratio. */
  width: number;
}

/** What the tile's visual draws in the frame: whether it already shows the name (a logo). */
export interface TileVisualGl {
  /** Names what it draws (its sources): part of the tile's picture key. */
  key: string;
  draw(painter: Painter, box: { width: number; height: number }): { namesTile: boolean };
}

/**
 * CollectionTile's GL form: the frame, the visual, scrim, progress and text in one picture,
 * baked once (see GlArt). The focus outline and scale aren't in it: they change with focus.
 */
export function collectionTileArt(
  {
    label,
    supportingText,
    ratio = 'landscape',
    labelPlacement = 'below',
    labelHidden = false,
    progress,
    width,
  }: CollectionTileGlProps,
  visual?: TileVisualGl
): GlArt {
  const frameHeight = width * TILE_RATIO[ratio];
  const corner = remPx(radius.md);
  const below = labelPlacement === 'below';
  return {
    key: `tile|${width}|${ratio}|${labelPlacement}|${labelHidden ? 1 : 0}|${label}|${supportingText ?? ''}|${progress ?? ''}|${visual?.key ?? ''}`,
    width,
    height: below ? frameHeight + belowTextHeight(Boolean(supportingText)) : frameHeight,
    corners: { x: 0, y: 0, width, height: frameHeight, radius: corner },
    draw(painter) {
      painter.rect(0, 0, width, frameHeight, FRAME);
      const named = visual?.draw(painter, { width, height: frameHeight }).namesTile ?? false;
      paintTileOverlay(painter, {
        width,
        height: frameHeight,
        label: labelHidden || (named && !below) ? undefined : label,
        supportingText,
        labelPlacement,
        progress,
        radius: 0,
      });
    },
    placeholder(painter) {
      painter.rect(0, 0, width, frameHeight, FRAME, { radius: corner });
    },
  };
}

/** The text under a `below` tile's frame (px). */
function belowTextHeight(supporting: boolean) {
  const line = (style: { fontSize: string; lineHeight: string }) =>
    Math.ceil(remPx(style.fontSize) * parseFloat(style.lineHeight)) + 2;
  return (
    remPx(space.xs) +
    line(typeScale.label) +
    (supporting ? remPx(space['2xs']) + line(typeScale.caption) : 0)
  );
}

/** The frame's fill, for live (unbaked) tiles. */
export function paintTileFrame(painter: Painter, width: number, height: number) {
  painter.rect(0, 0, width, height, FRAME, { radius: remPx(radius.md) });
}

/** The focus outline around a frame of `width` × `height`. */
export function paintFocusRing(painter: Painter, width: number, height: number) {
  const corner = remPx(radius.md);
  const distance = remPx(focusRing.width) + remPx(focusRing.offset);
  painter.rect(-distance, -distance, width + distance * 2, height + distance * 2, OUTLINE, {
    radius: corner + distance,
    border: remPx(focusRing.width),
  });
}

/** The GL overlay: scrim, progress hairline and text, over the visual. */
export function paintTileOverlay(
  painter: Painter,
  {
    width,
    height,
    label,
    supportingText,
    labelPlacement,
    progress,
    radius: corner = remPx(radius.md),
  }: {
    width: number;
    height: number;
    label?: string;
    supportingText?: string;
    labelPlacement: 'below' | 'overlay';
    progress?: number;
    /** The frame's corners; 0 in a baked picture. */
    radius?: number;
  }
) {
  const overlay = labelPlacement === 'overlay';
  if (overlay) {
    const top = height * 0.35;
    painter.gradient(0, top, width, height - top, SCRIM_FROM, SCRIM_TO, 'y', { radius: corner });
  }
  if (progress !== undefined) {
    const inset = remPx(space.xs);
    const barHeight = remPx('0.25rem');
    const barWidth = width - inset * 2;
    const y = height - inset - barHeight;
    painter.rect(inset, y, barWidth, barHeight, TRACK, { radius: barHeight / 2 });
    if (progress > 0)
      painter.rect(inset, y, barWidth * Math.min(1, progress), barHeight, BRAND, {
        radius: barHeight / 2,
      });
  }
  const side = remPx(space.sm);
  const maxWidth = width - side * 2;
  const labelSpec: TextSpec | null = label
    ? {
        text: label,
        size: remPx(typeScale.label.fontSize),
        weight: typeScale.label.fontWeight,
        lineHeight: parseFloat(typeScale.label.lineHeight),
        color: color.text,
        maxWidth,
      }
    : null;
  const supportingSpec: TextSpec | null = supportingText
    ? {
        text: supportingText,
        size: remPx(typeScale.caption.fontSize),
        weight: typeScale.caption.fontWeight,
        lineHeight: parseFloat(typeScale.caption.lineHeight),
        color: overlay ? color.text : color.textSecondary,
        maxWidth,
      }
    : null;
  if (overlay) {
    // Bottom up: supporting text, then the label above it
    let bottom = height - (progress !== undefined ? remPx(space.lg) : side);
    if (supportingSpec) {
      const drawn = painter.text(supportingSpec, side, bottom, { anchorY: 1 });
      bottom -= (drawn?.height ?? 0) + remPx(space['2xs']);
    }
    if (labelSpec) painter.text(labelSpec, side, bottom, { anchorY: 1 });
  } else {
    let top = height + remPx(space.xs);
    if (labelSpec) top += painter.text(labelSpec, 0, top)?.height ?? 0;
    if (supportingSpec) painter.text(supportingSpec, 0, top + remPx(space['2xs']));
  }
}
