import type { ImageStatus } from '../paint/painter';
import type { GlNode } from './scene';

/**
 * What components and hooks see of whatever draws the scene: no Pixi here, so the backend can be
 * loaded on its own (and replaced) without touching them.
 */
export interface GlRenderer {
  /** Asks for a frame. */
  invalidate(): void;
  /**
   * Fetch an image now, ahead of the paint that will draw it (`width`: the widest it's drawn, px).
   * Not held: evictable like any texture nobody draws.
   */
  preload(src: string, width: number): void;
  /** An image's load state (fallbacks react to a failure). */
  imageStatus(src: string): ImageStatus;
  subscribeImage(src: string, listener: () => void): () => void;
}

export interface GlRendererStats {
  frames: number;
  /** Node paints this frame. */
  repaints: number;
  uploads: number;
  uploadMs: number;
  textMs: number;
  frameMs: number;
  /** Baked nodes (GlNode.bake) rendered into their texture, and the time it took. */
  bakes: number;
  bakeMs: number;
  /** Component pictures: live, draw attempts, baked, time baking. */
  arts: number;
  artDraws: number;
  artBakes: number;
  artBakeMs: number;
  /** Fade edge redraws (what's under it changed). */
  bands: number;
  textures: number;
  textureBytes: number;
  failed: number;
  /** Frames that threw. */
  errors: number;
  /** WebGL contexts lost (the GPU reset or reclaimed it) and restored. */
  contextLosses: number;
  contextRestores: number;
}

/** The surface's side of a backend: the canvas, its size, the tree, its lifetime. */
export interface GlBackend extends GlRenderer {
  readonly canvas: HTMLCanvasElement;
  root: GlNode | null;
  /** How far beyond the canvas textures are still fetched (px). */
  prefetch: { x: number; y: number };
  readonly stats: GlRendererStats;
  /** The last frame error (debugging). */
  readonly lastError: string;
  /** Starts the GPU side (async); the scene builds meanwhile. Failures go to `onError`. */
  start(): void;
  resize(width: number, height: number, dpr: number): void;
  dispose(): void;
}

export interface GlBackendOptions {
  canvas: HTMLCanvasElement;
  /** CSS px */
  width: number;
  height: number;
  dpr: number;
  /** The backend can't run (no WebGL, init failed): the surface falls back to DOM. */
  onError: (error: unknown) => void;
  tuning?: GlTuning;
  /**
   * An opaque canvas filled with this colour (CSS hex) before each frame, for a surface nothing
   * shows through. Unset: transparent.
   */
  background?: string;
}

/** Settings a device class (or a debugging session) may change. */
export interface GlTuning {
  /** Texture memory kept, bytes. */
  textureBudget?: number;
  /** Multisampled canvas (smoother geometry edges; 4× the canvas's memory). */
  antialias?: boolean;
  /** Background work per frame, ms. */
  frameBudgetMs?: number;
  /**
   * Keep the canvas's buffer between frames (copied to the screen instead of swapped). On by
   * default: on the Tizen 5.5 TV a swapped buffer sometimes showed undrawn, every GL layer blank
   * for about 0.1 s (even while idle), and the copy cost no measurable fps there.
   */
  preserveDrawingBuffer?: boolean;
  /**
   * Keep the canvas transparent even with a `background` (for measuring). An opaque canvas spares
   * the compositor blending it over the page: on the Tizen 5.5 TV, presenting the transparent
   * full-screen canvas alone cost about 4 fps.
   */
  transparent?: boolean;
}
