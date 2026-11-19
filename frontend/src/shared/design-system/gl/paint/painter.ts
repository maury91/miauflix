import type { Rgba } from '../core/color';

export interface TextSpec {
  text: string;
  /** px */
  size: number;
  weight: number;
  /** Line height as a multiple of size. */
  lineHeight: number;
  color: string;
  /** Wrap or ellipsize to this width (px). */
  maxWidth: number;
  maxLines?: number;
  align?: 'left' | 'center';
  shadow?: boolean;
}

export type ImageStatus = 'loading' | 'ready' | 'failed';

/**
 * A component's picture, from its `*.art.ts` file: what its props draw, named by `key` (artKey). The renderer
 * runs `draw` once everything it asks for (images, texts) is ready or failed, bakes the result
 * into a texture, and every node showing the same key draws that one sprite. Immutable: new
 * props, a new key.
 */
export interface GlArt {
  /** Same key, same pixels: the props and sizes the drawing depends on. */
  key: string;
  /** px */
  width: number;
  height: number;
  /**
   * Draws the picture from (0, 0). The bake has no multisampling: draw with square corners and
   * let `corners` round them.
   */
  draw(painter: Painter): void;
  /** The box whose corners are cut round (antialiased) after `draw`. */
  corners?: { x: number; y: number; width: number; height: number; radius: number };
  /** Drawn live until the picture is baked, and under it while it fades in. */
  placeholder?(painter: Painter): void;
}

/**
 * Draws in a node's local coordinates (px, origin at its top left). The node's transform, clip
 * and opacity apply. Runs when the node changed, not every frame: whatever it draws stays until
 * the next paint.
 */
export interface Painter {
  /** A rounded rectangle; `border` > 0 draws only a ring that wide, inside the rectangle. */
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: Rgba,
    options?: { radius?: number; border?: number }
  ): void;
  /** A linear gradient from `from` to `to`, left to right (`x`) or top to bottom (`y`). */
  gradient(
    x: number,
    y: number,
    w: number,
    h: number,
    from: Rgba,
    to: Rgba,
    axis: 'x' | 'y',
    options?: { radius?: number }
  ): void;
  /**
   * An image from `src`, fetched and uploaded on demand. `cover` crops it to the box; `contain`
   * fits it in, placed by `align` (0 = start, 1 = end on each axis). Fades in once ready.
   */
  image(
    src: string,
    x: number,
    y: number,
    w: number,
    h: number,
    options?: { radius?: number; fit?: 'cover' | 'contain'; alignX?: number; alignY?: number }
  ): ImageStatus;
  /**
   * Text rendered to a texture once (canvas 2D) and drawn at its natural size. `anchorY` 1 puts
   * its bottom at `y`. Returns the drawn size, or null while it isn't ready.
   */
  text(
    spec: TextSpec,
    x: number,
    y: number,
    options?: { anchorX?: number; anchorY?: number }
  ): { width: number; height: number } | null;
  /** A text's size once its texture is ready (asks for it), without drawing it. */
  measure(spec: TextSpec): { width: number; height: number } | null;
  /**
   * An image's status, fetched (`width`: the widest it will be drawn, px) and kept for this node
   * without drawing it: for paints that wait on an image before drawing anything.
   */
  load(src: string, width: number): ImageStatus;
  /**
   * A component's picture (see GlArt) at the node's origin: one sprite once baked, its placeholder
   * meanwhile. True once baked.
   */
  art(art: GlArt): boolean;
  /**
   * A texture drawn once with canvas 2D (`width` × `height` px, cached by `key`), drawn into the
   * box. For static art the shader can't do: radial gradients, shades. False until ready.
   */
  canvas(
    key: string,
    width: number,
    height: number,
    draw: (context: CanvasRenderingContext2D) => void,
    x: number,
    y: number,
    w: number,
    h: number
  ): boolean;
}
