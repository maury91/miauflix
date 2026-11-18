import { RenderTexture, Sprite, type WebGLRenderer } from 'pixi.js';

import { Bakery, type Picture } from '../bake/bakery';
import type { FrameBudget } from '../core/frameScheduler';
import { GlNode } from '../core/scene';
import type { GlArt } from '../paint/painter';
import type { Evictable } from '../resources/textureBudget';
import type { FrameInfo, NodeState } from './nodeState';
import type { SceneSync } from './sync';
import type { TextureStore } from './textures';

export interface PictureBakerOptions {
  pixi: () => WebGLRenderer;
  frame: FrameInfo;
  store: TextureStore;
  sync: () => SceneSync;
  stats: { artDraws: number; artBakes: number; artBakeMs: number };
}

/**
 * Component pictures (GlArt) baked into textures: each is drawn by a stand-in node, and baked
 * once everything it asked for (images, texts) is ready or failed.
 */
export class PictureBaker {
  readonly bakery = new Bakery<RenderTexture>(art => {
    const node = new GlNode();
    node.paint = painter => art.draw(painter);
    return node;
  });
  /** Bytes in baked textures. */
  bytes = 0;

  constructor(private readonly options: PictureBakerOptions) {}

  picture(art: GlArt) {
    const { frame } = this.options;
    return this.bakery.picture(art, frame.dpr, frame.index);
  }

  /** A node's paint stopped showing its pictures. */
  release(node: GlNode, state: NodeState) {
    for (const picture of state.pictures) {
      picture.users.delete(node);
      picture.lastUsed = this.options.frame.index;
    }
    state.pictures = [];
  }

  /** Something a picture's stand-in waits on settled: true if it was one (drawn again). */
  settled(node: GlNode) {
    const picture = this.bakery.ofStandIn(node);
    if (picture) this.bakery.requeue(picture);
    return Boolean(picture);
  }

  get queued() {
    return this.bakery.queued;
  }

  /** Draws queued pictures, shown ones first, within the frame's budget. */
  bakeDue(budget: FrameBudget) {
    if (!this.bakery.queued) return;
    const sync = this.options.sync();
    const shown = (picture: Picture<RenderTexture>) => {
      for (const user of picture.users) if (sync.states.get(user)?.onScreen) return true;
      return false;
    };
    const due = this.bakery.due(shown, picture => sync.forget(picture.standIn));
    for (let n = 0; n < due.length && budget.allows(n); n++) {
      const { picture, shown } = due[n];
      this.bakery.take(picture);
      budget.run('bake', () => this.bake(picture, shown));
    }
  }

  private bake(picture: Picture<RenderTexture>, shown: boolean) {
    const start = performance.now();
    const { frame, stats } = this.options;
    const sync = this.options.sync();
    const node = picture.standIn;
    const state = sync.state(node);
    // Near: its images are fetched now, shown ones first
    state.x = 0;
    state.onScreen = shown;
    stats.artDraws++;
    sync.paint(node, state, true);
    // Something it draws isn't ready: drawn again once it settles
    if (state.used.some(used => used.state !== 'ready' && used.state !== 'failed')) return;
    const { art } = picture;
    if (art.corners) {
      const { x, y, width, height, radius } = art.corners;
      const texture = this.options.store.corner(radius);
      const corners: Array<[number, number, number, number]> = [
        [x, y, 1, 1],
        [x + width, y, -1, 1],
        [x, y + height, 1, -1],
        [x + width, y + height, -1, -1],
      ];
      for (const [cx, cy, sx, sy] of corners) {
        const sprite = new Sprite(texture);
        sprite.blendMode = 'erase';
        sprite.position.set(cx, cy);
        sprite.scale.set((sx * radius) / texture.width, (sy * radius) / texture.height);
        state.drawn.addChild(sprite);
      }
    }
    const texture = RenderTexture.create({
      width: art.width,
      height: art.height,
      resolution: frame.dpr,
    });
    this.options.pixi().render({
      container: state.view,
      target: texture,
      clear: true,
      clearColor: [0, 0, 0, 0],
    });
    // The pixels are kept: what it drew is free to go (and evictable once nobody else uses it)
    sync.forget(node);
    picture.texture = texture;
    picture.bytes = texture.source.pixelWidth * texture.source.pixelHeight * 4;
    picture.readyAt = frame.now;
    this.bytes += picture.bytes;
    for (const user of picture.users) user.repaint();
    stats.artBakes++;
    stats.artBakeMs += performance.now() - start;
  }

  /**
   * Baked pictures only far nodes show (culled, beyond the prefetch margin) or nobody shows, as
   * eviction candidates: shown ones rank after every unused texture. Their users paint them again
   * (baked anew) when they come back.
   */
  evictable(): Array<Evictable & { free: () => void }> {
    const sync = this.options.sync();
    const { frame } = this.options;
    const near = (picture: Picture<RenderTexture>) => {
      for (const user of picture.users)
        if (sync.states.get(user)?.syncedAt === frame.index) return true;
      return false;
    };
    const candidates: Array<Evictable & { free: () => void }> = [];
    for (const picture of this.bakery.pictures.values())
      if (picture.texture && !near(picture))
        candidates.push({
          lastUsed: picture.users.size ? picture.lastUsed + 1e9 : picture.lastUsed,
          bytes: picture.bytes,
          free: () => {
            for (const user of picture.users) {
              const state = sync.states.get(user);
              if (state) state.pictures = state.pictures.filter(entry => entry !== picture);
              user.repaint();
            }
            picture.users.clear();
            picture.texture!.destroy(true);
            this.bakery.remove(picture);
            this.bytes -= picture.bytes;
          },
        });
    return candidates;
  }

  /** Drops every picture (a lost context, disposal). */
  clear() {
    const sync = this.options.sync();
    for (const picture of this.bakery.clear()) {
      picture.texture?.destroy(true);
      sync.forget(picture.standIn);
    }
    this.bytes = 0;
  }
}
