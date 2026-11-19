import { artKey, type GlArt, hex, type Painter, remPx, type TextSpec } from '../gl/art';
import { color, tileScrim, typeScale } from '../tokens';
import {
  outlineDistanceRem,
  TILE_RATIO,
  tileMetrics,
  type TileRatio,
} from './collectionTile.metrics';

const FRAME = hex(color.surfaceRaised);
const OUTLINE = hex(color.focusOutline);
const TRACK = hex(color.borderSubtle);
const BRAND = hex(color.brand);
const SCRIM_FROM = hex(tileScrim.from.color);
const SCRIM_TO = hex(tileScrim.to.color);

export interface CollectionTileArtProps {
  label: string;
  supportingText?: string;
  ratio?: TileRatio;
  labelPlacement?: 'below' | 'overlay';
  labelHidden?: boolean;
  progress?: number;
  /** The tile's width (px); the frame's height follows the ratio. */
  width: number;
}

/** What the tile's visual draws in the frame: whether it already shows the name (a logo). */
export interface TileVisualArt {
  /** Names what it draws (its props, artKey): part of the tile's picture key. */
  key: string;
  draw(painter: Painter, box: { width: number; height: number }): { namesTile: boolean };
}

/**
 * CollectionTile's picture: the frame, the visual, scrim, progress and text in one picture, baked
 * once (see GlArt). The focus outline and scale aren't in it: they change with focus.
 */
export function collectionTileArt(props: CollectionTileArtProps, visual?: TileVisualArt): GlArt {
  const {
    label,
    supportingText,
    ratio = 'landscape',
    labelPlacement = 'below',
    labelHidden = false,
    progress,
    width,
  } = props;
  const frameHeight = width * TILE_RATIO[ratio];
  const corner = remPx(tileMetrics.radius);
  const below = labelPlacement === 'below';
  return {
    key: artKey('tile', { ...props, visual: visual?.key }),
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
    remPx(tileMetrics.belowGap) +
    line(typeScale.label) +
    (supporting ? remPx(tileMetrics.supportingGap) + line(typeScale.caption) : 0)
  );
}

/** The frame's fill, for live (unbaked) tiles. */
export function paintTileFrame(painter: Painter, width: number, height: number) {
  painter.rect(0, 0, width, height, FRAME, { radius: remPx(tileMetrics.radius) });
}

/** The focus outline around a frame of `width` × `height`. */
export function paintFocusRing(painter: Painter, width: number, height: number) {
  const corner = remPx(tileMetrics.radius);
  const distance = remPx(`${outlineDistanceRem}rem`);
  painter.rect(-distance, -distance, width + distance * 2, height + distance * 2, OUTLINE, {
    radius: corner + distance,
    border: remPx(tileMetrics.outlineWidth),
  });
}

/** The overlay: scrim, progress hairline and text, over the visual. */
export function paintTileOverlay(
  painter: Painter,
  {
    width,
    height,
    label,
    supportingText,
    labelPlacement,
    progress,
    radius: corner = remPx(tileMetrics.radius),
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
    const top = height * tileScrim.from.at;
    const bottom = height * tileScrim.to.at;
    painter.gradient(0, top, width, bottom - top, SCRIM_FROM, SCRIM_TO, 'y', { radius: corner });
  }
  if (progress !== undefined) {
    const inset = remPx(tileMetrics.progressInset);
    const barHeight = remPx(tileMetrics.progressHeight);
    const barWidth = width - inset * 2;
    const y = height - inset - barHeight;
    painter.rect(inset, y, barWidth, barHeight, TRACK, { radius: barHeight / 2 });
    if (progress > 0)
      painter.rect(inset, y, barWidth * Math.min(1, progress), barHeight, BRAND, {
        radius: barHeight / 2,
      });
  }
  const side = remPx(tileMetrics.overlayInset);
  const gap = remPx(tileMetrics.supportingGap);
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
    let bottom =
      height - (progress !== undefined ? remPx(tileMetrics.overlayInsetOverProgress) : side);
    if (supportingSpec) {
      const drawn = painter.text(supportingSpec, side, bottom, { anchorY: 1 });
      bottom -= (drawn?.height ?? 0) + gap;
    }
    if (labelSpec) painter.text(labelSpec, side, bottom, { anchorY: 1 });
  } else {
    let top = height + remPx(tileMetrics.belowGap);
    if (labelSpec) top += painter.text(labelSpec, 0, top)?.height ?? 0;
    if (supportingSpec) painter.text(supportingSpec, 0, top + gap);
  }
}
