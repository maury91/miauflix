import { BufferImageSource, ImageSource, Texture, type WebGLRenderer } from 'pixi.js';

import type { Rgba } from '../core/color';
import type { FrameBudget } from '../core/frameScheduler';
import type { GlNode } from '../core/scene';
import type { ImageStatus, TextSpec } from '../paint/painter';
import { cornerRaster, gradientRaster, type Raster } from '../paint/rasters';
import { rasterizeText, textFont, textKey } from '../paint/textRaster';
import { ImagePipeline, type ImagePriority } from '../resources/imagePipeline';
import type { FrameInfo, NodeState } from './nodeState';

/** Image uploads (texImage2D) per frame, within the frame's budget. */
const UPLOADS_PER_FRAME = 2;
const FETCHES_AT_ONCE = 6;
/** Wider decodes of a ready image that may fail before it keeps the pixels it has. */
const UPGRADE_ATTEMPTS = 2;

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
  /** The width (device px, 0 for any) its current pixels were decoded for (set on upload). */
  loadWidth: number;
  /** The width the decode under way was asked for. */
  decodeWidth: number;
  /** Wider decodes that failed: after a couple, it keeps the pixels it has. */
  upgradeFailures: number;
  /** Ready, and a wider decode is on its way (the current texture shows meanwhile). */
  upgrading: boolean;
  /** Nodes whose current paint uses it: repainted when it becomes ready or fails. */
  users: Set<GlNode>;
}

interface QueuedRender {
  key: string;
  render: () => Raster & { resolution?: number };
  /** A text's face: drawn once it's loaded. */
  face?: { font: string; text: string };
}

export interface TextureStoreOptions {
  pixi: () => WebGLRenderer;
  frame: FrameInfo;
  invalidate: () => void;
  /** An entry became ready or failed: its users paint again. */
  onSettled: (entry: TextureEntry) => void;
  /** Whether a text's face is loaded (FontEpoch.fontReady): if not, it waits in the queue. */
  fontReady: (font: string, text: string) => boolean;
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
  /** The font epoch (FontEpoch): part of every text's key. */
  fontEpoch = 0;
  private wanted = new Set<TextureEntry>();
  private uploads: TextureEntry[] = [];
  private renders: QueuedRender[] = [];
  private waitingForFaces = 0;
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
        const upgrade = entry?.state === 'ready' && entry.upgrading;
        if (!entry || (entry.state !== 'loading' && !upgrade)) {
          bitmap.close?.();
          return;
        }
        if (!upgrade) entry.state = 'decoded';
        entry.bitmap = bitmap;
        this.uploads.push(entry);
        options.invalidate();
      },
      onFailed: src => {
        const entry = this.entries.get(src);
        // A wider decode failing keeps the pixels it has
        if (entry?.upgrading) {
          entry.upgrading = false;
          entry.upgradeFailures++;
        }
        if (!entry || entry.state !== 'loading') return;
        this.fail(entry);
        this.settled(entry);
      },
    });
  }

  /** Uploads or rasterizing left for the next frames. */
  get pendingUploads() {
    return this.uploads.length;
  }

  /** Texts waiting for their face don't count: FontEpoch asks for a frame once it's in. */
  get pendingRenders() {
    return this.renders.length - this.waitingForFaces;
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
        loadWidth: 0,
        decodeWidth: 0,
        upgradeFailures: 0,
        upgrading: false,
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
    else if (entry.state === 'ready') this.upgrade(entry, 'near');
    return entry;
  }

  /** Fetch now, first in line (not held). */
  preload(src: string, width: number) {
    const entry = this.entry(src, 'image');
    entry.wantWidth = Math.max(entry.wantWidth, width);
    entry.lastUsed = this.options.frame.index;
    if (entry.state === 'ready') this.upgrade(entry, 'visible');
    if (entry.state !== 'wanted') return;
    this.wanted.delete(entry);
    this.fetch(entry, 'visible');
  }

  /**
   * Drawn wider than its pixels were decoded for (a 160 px tile first, a 640 px hero later): a
   * wider decode replaces the texture once uploaded, the current one showing meanwhile.
   */
  private upgrade(entry: TextureEntry, priority: ImagePriority) {
    const want = Math.ceil(entry.wantWidth * this.options.frame.dpr);
    if (
      entry.upgrading ||
      entry.upgradeFailures >= UPGRADE_ATTEMPTS ||
      !entry.loadWidth ||
      want <= entry.loadWidth * 1.25 ||
      want <= entry.width
    )
      return;
    entry.upgrading = true;
    entry.visible = priority === 'visible';
    this.images.request(entry.key, priority, () => this.loadWidth(entry));
  }

  /** Read as the decode starts: paints may draw it wider meanwhile. */
  private loadWidth(entry: TextureEntry) {
    entry.decodeWidth = Math.ceil(entry.wantWidth * this.options.frame.dpr);
    return entry.decodeWidth;
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
    this.images.request(entry.key, priority, () => this.loadWidth(entry));
  }

  /** Decoded images to the GPU, visible first, within the frame's budget. */
  upload(budget: FrameBudget) {
    this.uploads.sort((a, b) => Number(b.visible) - Number(a.visible));
    for (let n = 0; n < UPLOADS_PER_FRAME && this.uploads.length && budget.allows(n); n++) {
      const entry = this.uploads.shift()!;
      if (this.entries.get(entry.key) !== entry || !entry.bitmap) continue;
      // A wider decode of a ready image: swapped in without a fade, the old texture freed
      const previous = entry.upgrading && entry.state === 'ready' ? entry.texture : null;
      entry.upgrading = false;
      let source: ImageSource | null = null;
      try {
        budget.run('upload', () => {
          source = new ImageSource({
            resource: entry.bitmap!,
            alphaMode: 'premultiply-alpha-on-upload',
          });
          // Now, not at first draw: uploads stay within the per-frame budget
          this.options.pixi().texture.initSource(source);
          entry.bitmap!.close?.();
          entry.bitmap = null;
          if (previous) {
            const readyAt = entry.readyAt;
            this.bytes -= entry.bytes;
            previous.destroy(true);
            this.ready(entry, new Texture({ source }));
            entry.readyAt = readyAt;
          } else this.ready(entry, new Texture({ source }));
          // Only now: a decode or upload that failed leaves the width of the pixels it has
          entry.loadWidth = entry.decodeWidth;
        });
        this.uploaded++;
      } catch (error) {
        if (previous) {
          // The wider pixels didn't make it: the ones it has stay
          console.error('[gl] image upgrade failed', entry.key, error);
          entry.upgradeFailures++;
          (source as ImageSource | null)?.destroy();
          entry.bitmap?.close?.();
          entry.bitmap = null;
          continue;
        }
        // Settled as failed: its users draw their fallback instead of waiting forever
        console.error('[gl] image upload failed', entry.key, error);
        (source as ImageSource | null)?.destroy();
        this.fail(entry);
      }
      this.settled(entry);
    }
  }

  // Texts and canvas drawings

  /**
   * A text's texture: rasterized in a coming frame, at `resolution` texture px per CSS px (its
   * size stays in CSS px).
   */
  text(spec: TextSpec, resolution: number) {
    const entry = this.entry(`${textKey(spec)}|${resolution}|${this.fontEpoch}`, 'text');
    this.queueRender(
      entry,
      () => this.rasterize(rasterizeText(spec, this.scratch, resolution), resolution),
      { font: textFont(spec), text: spec.text }
    );
    return entry;
  }

  /** A font loaded after texts were drawn in a fallback: new keys for new texts (the old age out). */
  nextFontEpoch(epoch: number) {
    this.fontEpoch = epoch;
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

  /**
   * Rasterizes queued texts and drawings within the frame's budget (at least one). Texts whose
   * face is still loading stay queued.
   */
  renderQueued(budget: FrameBudget) {
    const waiting: QueuedRender[] = [];
    for (let n = 0; this.renders.length && budget.allows(n); ) {
      const queued = this.renders.shift()!;
      const entry = this.entries.get(queued.key);
      if (!entry || entry.state !== 'loading') {
        this.rendersQueued.delete(queued.key);
        continue;
      }
      if (queued.face && !this.options.fontReady(queued.face.font, queued.face.text)) {
        waiting.push(queued);
        continue;
      }
      this.rendersQueued.delete(queued.key);
      try {
        budget.run('text', () => {
          const raster = queued.render();
          this.ready(entry, this.pixels(raster, raster.resolution));
        });
      } catch (error) {
        console.error('[gl] texture render failed', queued.key, error);
        this.fail(entry);
      }
      this.settled(entry);
      n++;
    }
    this.renders.unshift(...waiting);
    this.waitingForFaces = waiting.length;
  }

  private queueRender(
    entry: TextureEntry,
    render: () => Raster & { resolution?: number },
    face?: QueuedRender['face']
  ) {
    if (entry.state !== 'loading' || this.rendersQueued.has(entry.key)) return;
    this.rendersQueued.add(entry.key);
    this.renders.push({ key: entry.key, render, face });
  }

  private rasterize(canvas: HTMLCanvasElement, resolution = 1): Raster & { resolution: number } {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    return { width: data.width, height: data.height, data: data.data, resolution };
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
  private pixels(raster: Raster, resolution = 1) {
    const { data } = raster;
    const source = new BufferImageSource({
      resource: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      width: raster.width,
      height: raster.height,
      resolution,
      format: 'rgba8unorm',
      alphaMode: 'premultiply-alpha-on-upload',
    });
    this.options.pixi().texture.initSource(source);
    return new Texture({ source });
  }

  private ready(entry: TextureEntry, texture: Texture) {
    entry.texture = texture;
    // CSS px (a text at a higher resolution has more texture px)
    entry.width = texture.width;
    entry.height = texture.height;
    entry.bytes = texture.source.pixelWidth * texture.source.pixelHeight * 4;
    entry.state = 'ready';
    entry.readyAt = entry.kind === 'image' ? this.options.frame.now : -Infinity;
    this.bytes += entry.bytes;
  }

  private fail(entry: TextureEntry) {
    entry.bitmap?.close?.();
    entry.bitmap = null;
    entry.texture = null;
    entry.state = 'failed';
    if (entry.kind === 'image') this.failed++;
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

  /**
   * Drops images nobody paints or listens to that hold no pixels (failed, or never fetched): they
   * count for no bytes, so the budget never frees them. A later paint asks again.
   */
  prune() {
    for (const entry of this.entries.values())
      if (
        entry.kind === 'image' &&
        (entry.state === 'failed' || entry.state === 'wanted') &&
        !entry.users.size &&
        !this.listeners.has(entry.key)
      )
        this.free(entry);
  }

  free(entry: TextureEntry) {
    entry.texture?.destroy(true);
    entry.bitmap?.close?.();
    this.entries.delete(entry.key);
    this.wanted.delete(entry);
    this.images.cancel(entry.key);
    this.bytes -= entry.bytes;
  }

  /**
   * Drops every text texture (a font face loaded: they were drawn with the fallback), returning
   * the nodes that drew them, to paint again.
   */
  dropTexts() {
    const users = new Set<GlNode>();
    for (const entry of [...this.entries.values()])
      if (entry.kind === 'text') {
        for (const user of entry.users) users.add(user);
        this.free(entry);
      }
    this.renders = this.renders.filter(render => this.entries.has(render.key));
    this.rendersQueued = new Set(this.renders.map(render => render.key));
    return users;
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
    this.waitingForFaces = 0;
    this.rendersQueued.clear();
    for (const texture of this.corners.values()) texture.destroy(true);
    this.corners.clear();
  }
}

export function statusOf(entry: TextureEntry | undefined): ImageStatus {
  if (!entry) return 'loading';
  return entry.state === 'failed' ? 'failed' : entry.state === 'ready' ? 'ready' : 'loading';
}
