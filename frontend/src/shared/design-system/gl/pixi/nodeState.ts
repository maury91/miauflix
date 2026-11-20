import type { Container, Graphics, RenderTexture, Sprite, Texture } from 'pixi.js';

import type { Picture } from '../bake/bakery';
import type { GlNode } from '../core/scene';
import type { TextureEntry } from './textures';

/** Shared by the backend's parts: the frame being drawn. */
export interface FrameInfo {
  /** Frames drawn so far (the LRU's clock). */
  index: number;
  /** The frame's time (rAF). */
  now: number;
  dpr: number;
  /** CSS px */
  width: number;
  height: number;
}

/** A node baked into one texture (GlNode.bake), shown as `sprite`. */
export interface BakedLayer {
  texture: RenderTexture;
  sprite: Sprite;
  dirty: boolean;
  /** Renders that threw in a row (SceneSync gives up after a few). */
  failures: number;
}

/** A node's fade edge (GlNode.fade with fadeFrom): 1 px strips of a copy of its source. */
export interface FadeBand {
  container: Container;
  texture: RenderTexture | null;
  /** The box it was built for. */
  key: string;
  /** Canvas px row of its first strip. */
  start: number;
  dirty: boolean;
  failures: number;
  source: GlNode;
  /** The node that draws the band (its container holds it). */
  owner: GlNode;
}

/** What a node is in Pixi. */
export interface NodeState {
  view: Container;
  /** The node's own paint, under its children. */
  drawn: Container;
  mask: Graphics | null;
  maskKey: string;
  used: TextureEntry[];
  pictures: Picture<RenderTexture>[];
  /** Frame textures (crops) made by its paint, destroyed with the next paint. */
  owned: Texture[];
  /** Canvas box (px) and scale from the last sync (x Infinity: beyond the prefetch margin). */
  x: number;
  y: number;
  scale: number;
  onScreen: boolean;
  /** Within the prefetch margin as last synced (culled nodes and their subtree aren't). */
  near: boolean;
  /** What its parent passed in the last sync (canvas origin, scale, opacity): unchanged, and the
   * node unchanged, its subtree is skipped. */
  inX: number;
  inY: number;
  inScale: number;
  inOpacity: number;
  baked: BakedLayer | null;
  band: FadeBand | null;
}
