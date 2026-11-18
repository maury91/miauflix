import { BufferImageSource, ImageSource, Texture, type WebGLRenderer } from 'pixi.js';

import type { Rgba } from '../core/color';
import type { FrameBudget } from '../core/frameScheduler';
import type { GlNode } from '../core/scene';
import type { ImageStatus, TextSpec } from '../paint/painter';
import { cornerRaster, gradientRaster, type Raster } from '../paint/rasters';
import { rasterizeText, textKey } from '../paint/textRaster';
import { ImagePipeline, type ImagePriority } from '../resources/imagePipeline';
import type { FrameInfo, NodeState } from './nodeState';

/** Image uploads (texImage2D) per frame, within the frame's budget. */
const UPLOADS_PER_FRAME = 2;
const FETCHES_AT_ONCE = 6;

export interface TextureEntry {
  key: string;
  /** wanted: painted, but not near the screen yet (not fetched). */
  state: 'wanted' | 'loading' | 'decoded' | 'ready' | 'failed';
  kind: 'image' | 'text' | 'canvas' | 'gradient';
  texture: Texture | null;
  width: number;
  height: number;
  bytes: number;
  /** Frame it was last used by a painted node (for eviction once unused). */
  lastUsed: number;
  readyAt: number;
  bitmap: ImageBitmap | null;
  visible: boolean;
  /** The widest it's drawn (px): larger images are scaled down to it as they decode. */
  wantWidth: number;
  /** Nodes whose current paint uses it: repainted when it becomes ready or fails. */
  users: Set<GlNode>;
}

export interface TextureStoreOptions {
  pixi: () => WebGLRenderer;
  frame: FrameInfo;
  invalidate: () => void;
  /** An entry became ready or failed: its users paint again. */
  onSettled: (entry: TextureEntry) => void;
}

/**
 * Every texture nodes paint from: images (fetched, decoded, uploaded a few per frame), texts and
 * canvas drawings (rasterized within the frame's budget), gradients and corner masks. Counts the
 * bytes for the budget; the backend decides what to evict.
 */
export class TextureStore {
  readonly entries = new Map<string, TextureEntry>();
  bytes = 0;
  /** Images that failed to load, and images uploaded. */
  failed = 0;
  uploaded = 0;
  private wanted = new Set<TextureEntry>();
  private uploads: TextureEntry[] = [];
  private renders: Array<{ key: string; render: () => Raster }> = [];
  private rendersQueued = new Set<string>();
  private listeners = new Map<string, Set<() => void>>();
  private corners = new Map<number, Texture>();
  private scratch: HTMLCanvasElement = document.createElement('canvas');
  private readonly images: ImagePipeline;

  constructor(private readonly options: TextureStoreOptions) {
    this.images = new ImagePipeline({
      concurrency: FETCHES_AT_ONCE,
      onLoaded: (src, bitmap) => {
        const entry = this.entries.get(src);
        if (!entry || entry.state !== 'loading') {
          bitmap.close?.();
          return;
        }
        entry.state = 'decoded';
        entry.bitmap = bitmap;
        this.uploads.push(entry);
        options.invalidate();
      },
      onFailed: src => {
        const entry = this.entries.get(src);
        if (!entry || entry.state !== 'loading') return;
        entry.state = 'failed';
        this.failed++;
        this.settled(entry);
      },
    });
  }

  /** Uploads or rasterizing left for the next frames. */
  get pendingUploads() {
    return this.uploads.length;
  }

  get pendingRenders() {
    return this.renders.length;
  }

  entry(key: string, kind: TextureEntry['kind']) {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        key,
        state: kind === 'image' ? 'wanted' : 'loading',
        kind,
        texture: null,
        width: 0,
        height: 0,
        bytes: 0,
        lastUsed: this.options.frame.index,
        readyAt: -Infinity,
        bitmap: null,
        visible: false,
        wantWidth: 0,
        users: new Set(),
      };
      this.entries.set(key, entry);
    }
    return entry;
  }

  /** The node's paint uses it: kept, and the node repaints when it settles. */
  use(entry: TextureEntry, node: GlNode, state: NodeState) {
    if (!entry.users.has(node)) {
      entry.users.add(node);
      state.used.push(entry);
    }
    entry.lastUsed = this.options.frame.index;
  }

  /** The node's paint no longer uses it. */
  release(entry: TextureEntry, node: GlNode) {
    entry.users.delete(node);
    entry.lastUsed = this.options.frame.index;
  }

  // Images

  /** An image a paint draws (`width`: drawn px): fetched once a user comes near the screen. */
  image(src: string, width: number) {
    const entry = this.entry(src, 'image');
    entry.wantWidth = Math.max(entry.wantWidth, width);
    if (entry.state === 'wanted') this.wanted.add(entry);
    return entry;
  }

  /** Fetch now, first in line (not held). */
  preload(src: string, width: number) {
    const entry = this.entry(src, 'image');
    entry.wantWidth = Math.max(entry.wantWidth, width);
    entry.lastUsed = this.options.frame.index;
    if (entry.state !== 'wanted') return;
    this.wanted.delete(entry);
    this.fetch(entry, 'visible');
  }

  status(src: string): ImageStatus {
    return statusOf(this.entries.get(src));
  }

  subscribe(src: string, listener: () => void) {
    let listeners = this.listeners.get(src);
    if (!listeners) this.listeners.set(src, (listeners = new Set()));
    listeners.add(listener);
    return () => {
      listeners!.delete(listener);
      if (!listeners!.size) this.listeners.delete(src);
    };
  }

  /** Painted images not fetched yet: fetched once a user is near the screen, visible first. */
  fetchWanted(placement: (node: GlNode) => ImagePriority | null) {
    for (const entry of this.wanted) {
      let near = false;
      let visible = false;
      for (const node of entry.users) {
        const where = placement(node);
        if (!where) continue;
        near = true;
        if (where === 'visible') visible = true;
      }
      if (!near) continue;
      this.wanted.delete(entry);
      this.fetch(entry, visible ? 'visible' : 'near');
    }
  }

  private fetch(entry: TextureEntry, priority: ImagePriority) {
    entry.state = 'loading';
    entry.visible = priority === 'visible';
    this.images.request(entry.key, priority, () =>
      Math.ceil(entry.wantWidth * this.options.frame.dpr)
    );
  }

  /** Decoded images to the GPU, visible first, within the frame's budget. */
  upload(budget: FrameBudget) {
    this.uploads.sort((a, b) => Number(b.visible) - Number(a.visible));
    for (let n = 0; n < UPLOADS_PER_FRAME && this.uploads.length && budget.allows(n); n++) {
      const entry = this.uploads.shift()!;
      if (this.entries.get(entry.key) !== entry || !entry.bitmap) continue;
      budget.run('upload', () => {
        const source = new ImageSource({
          resource: entry.bitmap!,
          alphaMode: 'premultiply-alpha-on-upload',
        });
        // Now, not at first draw: uploads stay within the per-frame budget
        this.options.pixi().texture.initSource(source);
        entry.bitmap!.close?.();
        entry.bitmap = null;
        this.ready(entry, new Texture({ source }));
      });
      this.uploaded++;
      this.settled(entry);
    }
  }

  // Texts and canvas drawings

  /** A text's texture: rasterized in a coming frame. */
  text(spec: TextSpec) {
    const entry = this.entry(textKey(spec), 'text');
    this.queueRender(entry, () => this.rasterize(rasterizeText(spec, this.scratch)));
    return entry;
  }

  /** A texture drawn with canvas 2D (`width` × `height` px), cached by `key`. */
  canvas(
    key: string,
    width: number,
    height: number,
    draw: (context: CanvasRenderingContext2D) => void
  ) {
    const entry = this.entry(`canvas:${key}`, 'canvas');
    this.queueRender(entry, () => {
      const target = document.createElement('canvas');
      target.width = Math.max(1, Math.round(width));
      target.height = Math.max(1, Math.round(height));
      draw(target.getContext('2d')!);
      return this.rasterize(target);
    });
    return entry;
  }

  /** Rasterizes queued texts and drawings within the frame's budget (at least one). */
  renderQueued(budget: FrameBudget) {
    for (let n = 0; this.renders.length && budget.allows(n); ) {
      const { key, render } = this.renders.shift()!;
      this.rendersQueued.delete(key);
      const entry = this.entries.get(key);
      if (!entry || entry.state !== 'loading') continue;
      budget.run('text', () => this.ready(entry, this.pixels(render())));
      this.settled(entry);
      n++;
    }
  }

  private queueRender(entry: TextureEntry, render: () => Raster) {
    if (entry.state !== 'loading' || this.rendersQueued.has(entry.key)) return;
    this.rendersQueued.add(entry.key);
    this.renders.push({ key: entry.key, render });
  }

  private rasterize(canvas: HTMLCanvasElement): Raster {
    return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  }

  // Generated textures

  /** A two-stop gradient (straight colours, premultiplied on upload), made at once. */
  gradient(from: Rgba, to: Rgba, axis: 'x' | 'y') {
    const entry = this.entry(`gradient:${from.join(',')}|${to.join(',')}|${axis}`, 'gradient');
    if (entry.state !== 'ready') this.ready(entry, this.pixels(gradientRaster(from, to, axis)));
    return entry;
  }

  /** What a rounded corner of `radius` CSS px cuts away (top left), at the frame's dpr. */
  corner(radius: number) {
    let texture = this.corners.get(radius);
    if (!texture) {
      texture = this.pixels(cornerRaster(Math.max(1, Math.ceil(radius * this.options.frame.dpr))));
      this.corners.set(radius, texture);
    }
    return texture;
  }

  /**
   * Pixels to a texture. Not a canvas source: on the TV (Chromium 69) a canvas of about
   * 256 × 256 px or more is GPU-backed, and uploading it to WebGL gives an empty texture.
   */
  private pixels(raster: Raster) {
    const { data } = raster;
    const source = new BufferImageSource({
      resource: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      width: raster.width,
      height: raster.height,
      format: 'rgba8unorm',
      alphaMode: 'premultiply-alpha-on-upload',
    });
    this.options.pixi().texture.initSource(source);
    return new Texture({ source });
  }

  private ready(entry: TextureEntry, texture: Texture) {
    entry.texture = texture;
    entry.width = texture.source.pixelWidth;
    entry.height = texture.source.pixelHeight;
    entry.bytes = entry.width * entry.height * 4;
    entry.state = 'ready';
    entry.readyAt = entry.kind === 'image' ? this.options.frame.now : -Infinity;
    this.bytes += entry.bytes;
  }

  /** It became ready or failed: its users paint again, listeners hear it. */
  private settled(entry: TextureEntry) {
    this.options.onSettled(entry);
    this.listeners.get(entry.key)?.forEach(listener => listener());
    this.options.invalidate();
  }

  // Memory

  /** Ready textures no paint uses: what the budget may free first. */
  unused() {
    const unused: TextureEntry[] = [];
    for (const entry of this.entries.values())
      if (entry.state === 'ready' && !entry.users.size) unused.push(entry);
    return unused;
  }

  free(entry: TextureEntry) {
    entry.texture?.destroy(true);
    entry.bitmap?.close?.();
    this.entries.delete(entry.key);
    this.wanted.delete(entry);
    this.images.cancel(entry.key);
    this.bytes -= entry.bytes;
  }

  /** Drops everything (a lost context took the pixels; disposal). Listeners stay. */
  clear() {
    for (const entry of this.entries.values()) {
      entry.texture?.destroy(true);
      entry.bitmap?.close?.();
    }
    this.entries.clear();
    this.bytes = 0;
    this.uploads = [];
    this.wanted.clear();
    this.images.clear();
    this.renders = [];
    this.rendersQueued.clear();
    for (const texture of this.corners.values()) texture.destroy(true);
    this.corners.clear();
  }
}

export function statusOf(entry: TextureEntry | undefined): ImageStatus {
  if (!entry) return 'loading';
  return entry.state === 'failed' ? 'failed' : entry.state === 'ready' ? 'ready' : 'loading';
}
