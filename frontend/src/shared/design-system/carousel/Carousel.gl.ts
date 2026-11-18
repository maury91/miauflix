import { easeStandard, type GlNode, hex, type Painter } from '../gl';
import { color, duration } from '../tokens';
import type { CollectionGeometry } from './collectionGeometry';

const CANVAS = hex(color.canvas);
const CANVAS_CLEAR = hex(color.canvas, 0);
const BLACK = hex('#000000');
const BLACK_CLEAR = hex('#000000', 0);

/**
 * Carousel's GL form: a group of item sprites (each tile one baked picture) on a track. Each item
 * spans `itemExtent` on the track's X axis; the track's X is the only thing that moves, animated
 * here; the edges fade the peeks into the surface.
 */
export function itemExtent(index: number, { itemWidth, gap, peek }: CollectionGeometry) {
  const start = peek + index * (itemWidth + gap);
  return { start, end: start + itemWidth };
}

/** Moves the track so `leadingIndex` is the left-most whole item (at once the first time). */
export function placeTrack(
  track: GlNode,
  leadingIndex: number,
  { itemWidth, gap }: CollectionGeometry,
  animate: boolean
) {
  const x = -leadingIndex * (itemWidth + gap);
  if (animate) track.animate('x', x, parseFloat(duration.fast), easeStandard);
  else track.set({ x });
}

/** The peeks fade into the surface where there's more to scroll to. */
export function paintCarouselEdges(
  painter: Painter,
  {
    peek,
    width,
    height,
    surface,
    canGoBack,
    canGoForward,
  }: {
    peek: number;
    width: number;
    height: number;
    surface: 'canvas' | 'black';
    canGoBack: boolean;
    canGoForward: boolean;
  }
) {
  if (peek <= 0) return;
  const [solid, clear] = surface === 'black' ? [BLACK, BLACK_CLEAR] : [CANVAS, CANVAS_CLEAR];
  if (canGoBack) painter.gradient(0, 0, peek, height, solid, clear, 'x');
  if (canGoForward) painter.gradient(width - peek, 0, peek, height, clear, solid, 'x');
}
