import {
  Container,
  Graphics,
  Matrix,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
  type WebGLRenderer,
} from 'pixi.js';

import type { GlNode } from '../core/scene';
import type { Painter } from '../paint/painter';
import type { FadeIns } from './fadeIns';
import type { BakedLayer, FadeBand, FrameInfo, NodeState } from './nodeState';
import type { TextureStore } from './textures';

export interface SceneSyncOptions {
  pixi: () => WebGLRenderer;
  frame: FrameInfo;
  store: TextureStore;
  fades: FadeIns;
  /** How far beyond the canvas nodes still count as near (textures fetched), px. */
  prefetch: () => { x: number; y: number };
  painter: (node: GlNode, state: NodeState, baking: boolean) => Painter;
  /** The node's paint stopped showing its pictures. */
  releasePictures: (node: GlNode, state: NodeState) => void;
  stats: { repaints: number; bakes: number; bakeMs: number; bands: number };
}

/** Renders of a baked layer or fade band that may throw in a row before it's left as it is. */
const RENDER_ATTEMPTS = 3;

/** Something to redraw when a node under it changes: a baked layer, a fade band. */
interface Dirtiable {
  dirty: boolean;
}

/**
 * Mirrors the GlNode tree into Pixi containers: transforms, visibility, culling, clips, the
 * baked layers and the fade edges, and paints the nodes that changed. Frames only move
 * containers; a paint runs only when its node asked for it.
 */
export class SceneSync {
  readonly states = new Map<GlNode, NodeState>();
  /** The fade bands copying each source node. */
  private bandsBySource = new Map<GlNode, Set<FadeBand>>();
  /** Baked layers synced this frame, in tree order. */
  private bakedThisFrame: Array<{ node: GlNode; layer: BakedLayer }> = [];
  private bandsThisFrame: FadeBand[] = [];
  private disposed = false;
  /** A baked layer or band failed this frame and is tried again on the next. */
  retrying = false;

  constructor(private readonly options: SceneSyncOptions) {}

  state(node: GlNode): NodeState {
    let state = this.states.get(node);
    if (!state) {
      const view = new Container();
      view.sortableChildren = true;
      const drawn = new Container();
      drawn.zIndex = -Number.MAX_SAFE_INTEGER;
      view.addChild(drawn);
      state = {
        view,
        drawn,
        mask: null,
        maskKey: '',
        used: [],
        pictures: [],
        owned: [],
        x: Infinity,
        y: 0,
        scale: 1,
        onScreen: false,
        syncedAt: -1,
        baked: null,
        band: null,
      };
      this.states.set(node, state);
      nodeOf.set(view, node);
    }
    return state;
  }

  /** Syncs the tree, then redraws the baked layers and fade bands that changed. */
  syncRoot(root: GlNode) {
    this.bakedThisFrame = [];
    this.bandsThisFrame = [];
    this.retrying = false;
    this.sync(root, 0, 0, 1, 1, []);
    // Inner layers first: an outer one draws their sprites
    for (let index = this.bakedThisFrame.length - 1; index >= 0; index--) {
      const { node, layer } = this.bakedThisFrame[index];
      if (!layer.dirty) continue;
      this.attempt(layer, () => {
        this.bake(node, layer);
        // Outer baked layers hold this one's pixels (stale, or empty if an earlier try failed):
        // they bake after it, in this pass
        for (let parent = node.parent; parent; parent = parent.parent) {
          const baked = this.states.get(parent)?.baked;
          if (baked && parent.bake) baked.dirty = true;
        }
      });
    }
    // A clean band too, if its source stopped drawing (removed, culled with an ancestor)
    for (const band of this.bandsThisFrame)
      if (band.dirty || !this.sourceDrawn(band)) this.attempt(band, () => this.drawBand(band));
    return this.state(root).view;
  }

  /**
   * A render that throws must not stop the frame (the rest of the scene still draws): it stays
   * dirty for the next frames, then, failing every time, is left as it was last drawn.
   */
  private attempt(target: { dirty: boolean; failures: number }, render: () => void) {
    try {
      render();
      target.failures = 0;
    } catch (error) {
      console.error('[gl] layer render failed', error);
      if (++target.failures < RENDER_ATTEMPTS) this.retrying = true;
      else target.dirty = false;
    }
  }

  /** Runs the node's paint into fresh display objects (only when it changed). */
  paint(node: GlNode, state: NodeState, baking = false) {
    node.paintDirty = false;
    this.options.stats.repaints++;
    this.unpaint(node, state);
    if (node.paint) node.paint(this.options.painter(node, state, baking));
  }

  /** Drops what the node's paint drew and used. */
  private unpaint(node: GlNode, state: NodeState) {
    for (const entry of state.used) this.options.store.release(entry, node);
    state.used = [];
    this.options.releasePictures(node, state);
    for (const object of state.drawn.removeChildren()) object.destroy();
    for (const texture of state.owned) texture.destroy(false);
    state.owned = [];
    this.options.fades.drop(node);
  }

  private sync(
    node: GlNode,
    tx: number,
    ty: number,
    s: number,
    opacity: number,
    marks: readonly Dirtiable[]
  ) {
    const state = this.state(node);
    const view = state.view;
    if (node.bake) marks = [...marks, this.bakedLayer(node, state)];
    else if (state.baked) this.dropBaked(state);
    const bands = this.bandsBySource.get(node);
    if (bands) marks = [...marks, ...bands];
    if (node.changed) {
      node.changed = false;
      for (const mark of marks) mark.dirty = true;
    }
    const localX = node.x + (node.width / 2) * (1 - node.scale);
    const localY = node.y + (node.height / 2) * (1 - node.scale);
    view.position.set(localX, localY);
    view.scale.set(node.scale);
    view.alpha = node.opacity;
    const scale = s * node.scale;
    const x = tx + s * localX;
    const y = ty + s * localY;
    const alpha = opacity * node.opacity;
    let onScreen = true;
    if (node.width > 0 && node.height > 0) {
      const x1 = x + node.width * scale;
      const y1 = y + node.height * scale;
      const { width, height } = this.options.frame;
      const prefetch = this.options.prefetch();
      if (
        x1 < -prefetch.x ||
        y1 < -prefetch.y ||
        x > width + prefetch.x ||
        y > height + prefetch.y
      ) {
        // Beyond the prefetch margin: not drawn, children not visited
        view.visible = false;
        if (state.baked) state.baked.sprite.visible = false;
        state.x = Infinity;
        state.onScreen = false;
        return;
      }
      onScreen = x1 > 0 && y1 > 0 && x < width && y < height;
    }
    view.visible = alpha > 0 && onScreen;
    state.syncedAt = this.options.frame.index;
    state.x = x;
    state.y = y;
    state.scale = scale;
    state.onScreen = onScreen && alpha > 0;
    if (node.paintDirty) {
      this.paint(node, state);
      for (const mark of marks) mark.dirty = true;
    }
    if (state.baked) this.placeBaked(node, state, state.baked);

    // Clip (a stencil rectangle); a fade starts it at fade[0]
    const top = node.fade ? node.fade[0] : 0;
    const maskKey =
      node.clip && node.width > 0 && node.height > 0 ? `${top}|${node.width}|${node.height}` : '';
    if (maskKey !== state.maskKey) {
      state.maskKey = maskKey;
      if (state.mask) {
        view.mask = null;
        state.mask.destroy();
        state.mask = null;
      }
      if (maskKey) {
        state.mask = new Graphics().rect(0, top, node.width, node.height - top).fill(0xffffff);
        view.addChild(state.mask);
        view.mask = state.mask;
      }
    }
    this.syncBand(node, state, x, y, scale);

    const children = node.orderedChildren();
    children.forEach((child, index) => {
      const childState = this.state(child);
      // A baked child shows as its sprite; its own container is rendered into the texture
      const childView = child.bake ? this.bakedLayer(child, childState).sprite : childState.view;
      if (childView.parent !== view) view.addChild(childView);
      childView.zIndex = child.z * 100000 + index;
      this.sync(child, x, y, scale, alpha, marks);
      if (child.bake) childState.view.parent?.removeChild(childState.view);
    });
    // Children removed from the node
    for (const childView of [...view.children]) {
      if (
        childView === state.drawn ||
        childView === state.mask ||
        childView === state.band?.container
      )
        continue;
      const childNode = nodeOf.get(childView);
      if (!childNode || childNode.parent !== node) {
        view.removeChild(childView);
        if (childNode) this.release(childNode);
      }
    }
  }

  // Baked layers (GlNode.bake)

  private bakedLayer(node: GlNode, state: NodeState) {
    if (!state.baked) {
      const { frame } = this.options;
      const texture = RenderTexture.create({
        width: Math.max(1, node.width || frame.width),
        height: Math.max(1, node.height || frame.height),
        resolution: frame.dpr,
      });
      const sprite = new Sprite(texture);
      nodeOf.set(sprite, node);
      state.baked = { texture, sprite, dirty: true, failures: 0 };
    }
    return state.baked;
  }

  /** The sprite stands where the node's container would; the texture follows its box. */
  private placeBaked(node: GlNode, state: NodeState, layer: BakedLayer) {
    const { view } = state;
    layer.sprite.position.copyFrom(view.position);
    layer.sprite.scale.copyFrom(view.scale);
    layer.sprite.alpha = view.alpha;
    layer.sprite.visible = view.visible;
    // Drawn whole into the texture: the sprite applies the opacity and the culling
    view.alpha = 1;
    view.visible = true;
    const { frame } = this.options;
    const width = Math.max(1, node.width || frame.width);
    const height = Math.max(1, node.height || frame.height);
    const source = layer.texture.source;
    if (source.width !== width || source.height !== height || source.resolution !== frame.dpr) {
      layer.texture.resize(width, height, frame.dpr);
      layer.dirty = true;
    }
    this.bakedThisFrame.push({ node, layer });
  }

  private dropBaked(state: NodeState) {
    const { sprite, texture } = state.baked!;
    sprite.parent?.removeChild(sprite);
    sprite.destroy();
    texture.destroy(true);
    state.baked = null;
  }

  private bake(node: GlNode, layer: BakedLayer) {
    const start = performance.now();
    this.options.pixi().render({
      container: this.state(node).view,
      target: layer.texture,
      clear: true,
      clearColor: [0, 0, 0, 0],
      // At the texture's origin: the sprite places it
      transform: new Matrix(),
    });
    // After the render: one that threw is tried again next frame
    layer.dirty = false;
    this.options.stats.bakes++;
    this.options.stats.bakeMs += performance.now() - start;
  }

  // Fade bands (GlNode.fade with fadeFrom)

  /**
   * 1 px strips over the node's content, alpha 1 to 0 down the fade: copies of what's under it
   * (its source), rendered into a texture of just the band when the source changes.
   */
  private syncBand(node: GlNode, state: NodeState, x: number, y: number, scale: number) {
    const source = node.fade && node.fadeFrom;
    if (!source) {
      if (state.band) this.dropBand(state);
      return;
    }
    let band = state.band;
    if (band && band.source !== source) {
      this.dropBand(state);
      band = null;
    }
    if (!band) {
      const container = new Container();
      container.zIndex = Number.MAX_SAFE_INTEGER;
      state.view.addChild(container);
      band = state.band = {
        container,
        texture: null,
        key: '',
        start: 0,
        dirty: true,
        failures: 0,
        source,
      };
      let bands = this.bandsBySource.get(source);
      if (!bands) this.bandsBySource.set(source, (bands = new Set()));
      bands.add(band);
    }
    this.bandsThisFrame.push(band);
    const { frame } = this.options;
    const top = y + node.fade![0] * scale;
    const bottom = y + node.fade![1] * scale;
    const key = `${top}|${bottom}|${x}|${scale}|${frame.width}|${frame.dpr}`;
    if (key === band.key) return;
    band.key = key;
    for (const strip of band.container.removeChildren()) {
      (strip as Sprite).texture.destroy(false);
      strip.destroy();
    }
    const start = Math.round(top);
    const rows = Math.max(1, Math.round(bottom) - start);
    band.texture?.destroy(true);
    band.texture = RenderTexture.create({
      width: frame.width,
      height: rows,
      resolution: frame.dpr,
    });
    band.start = start;
    band.dirty = true;
    // Placed in canvas px: the node's container is at (x, y), scaled
    for (let row = 0; row < rows; row++) {
      const strip = new Sprite(
        new Texture({
          source: band.texture.source,
          frame: new Rectangle(0, row, frame.width, 1),
        })
      );
      strip.position.set(-x / scale, (start + row - y) / scale);
      strip.scale.set(1 / scale);
      strip.alpha = 1 - (row + 0.5) / rows;
      band.container.addChild(strip);
    }
  }

  private drawBand(band: FadeBand) {
    const source = this.states.get(band.source);
    if (!band.texture) return;
    // The source draws nothing now (removed, culled, or off screen, which Pixi skips without
    // clearing the target): the band would show stale pixels. Hidden, and dirty: drawn when back
    if (!source || !this.sourceDrawn(band)) {
      band.container.visible = false;
      band.dirty = true;
      return;
    }
    const view = band.source.bake ? source.baked!.sprite : source.view;
    // The source as it is on screen, moved up to the band's first row
    const scale = source.scale;
    this.options.pixi().render({
      container: view,
      target: band.texture,
      clear: true,
      clearColor: [0, 0, 0, 0],
      transform: new Matrix(scale, 0, 0, scale, source.x, source.y - band.start),
    });
    band.dirty = false;
    band.container.visible = true;
    this.options.stats.bands++;
  }

  /** The band's source was placed on screen this frame. */
  private sourceDrawn(band: FadeBand) {
    const source = this.states.get(band.source);
    return Boolean(
      source &&
        source.x !== Infinity &&
        source.onScreen &&
        source.syncedAt === this.options.frame.index
    );
  }

  private dropBand(state: NodeState) {
    const band = state.band!;
    for (const strip of band.container.removeChildren()) {
      (strip as Sprite).texture.destroy(false);
      strip.destroy();
    }
    band.container.destroy();
    band.texture?.destroy(true);
    const bands = this.bandsBySource.get(band.source);
    bands?.delete(band);
    if (bands && !bands.size) this.bandsBySource.delete(band.source);
    state.band = null;
  }

  // Lifetime

  /** A node gone from the tree (after this frame's sync, if it didn't come back). */
  private release(node: GlNode) {
    queueMicrotask(() => {
      if (node.parent || this.disposed) return;
      this.forget(node);
    });
  }

  /** Drops the node's containers and what its paint used (its subtree too). */
  forget(node: GlNode) {
    const state = this.states.get(node);
    if (!state) return;
    // The children it has, and the ones last synced into its container: a child detached in the
    // same commit as this node is only in the latter, and must release what it painted too
    const children = new Set(node.children);
    for (const childView of state.view.children) {
      const child = nodeOf.get(childView);
      if (child) children.add(child);
    }
    for (const child of children) {
      if (child.parent && child.parent !== node) {
        // Moved under another node: kept, its container out of this one (destroyed below)
        const childState = this.states.get(child);
        if (childState?.view.parent === state.view) state.view.removeChild(childState.view);
        if (childState?.baked?.sprite.parent === state.view)
          state.view.removeChild(childState.baked.sprite);
        continue;
      }
      this.forget(child);
    }
    this.unpaint(node, state);
    if (state.band) this.dropBand(state);
    if (state.baked) this.dropBaked(state);
    this.states.delete(node);
    state.view.parent?.removeChild(state.view);
    state.view.destroy({ children: true });
    node.paintDirty = true;
  }

  /** Everything paints again (a lost context took every texture). */
  repaintAll() {
    for (const [node, state] of this.states) {
      state.used = [];
      state.pictures = [];
      if (state.baked) state.baked.dirty = true;
      if (state.band) state.band.dirty = true;
      node.repaint();
    }
  }

  /** The canvas size or dpr changed: bands are rebuilt, baked layers follow in placeBaked. */
  resized() {
    for (const state of this.states.values()) {
      if (state.band) state.band.key = '';
      if (state.baked) state.baked.dirty = true;
    }
  }

  dispose() {
    this.disposed = true;
  }
}

const nodeOf = new WeakMap<Container, GlNode>();
