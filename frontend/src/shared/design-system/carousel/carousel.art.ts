import { hex, type Painter } from '../gl/art';
import { color } from '../tokens';

const CANVAS = hex(color.canvas);
const CANVAS_CLEAR = hex(color.canvas, 0);
const BLACK = hex('#000000');
const BLACK_CLEAR = hex('#000000', 0);

/** Carousel's edges: the peeks fade into the surface where there's more to scroll to. */
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
