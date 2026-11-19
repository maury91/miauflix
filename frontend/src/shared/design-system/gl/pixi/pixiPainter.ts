import {
  type Container,
  Graphics,
  Matrix,
  Rectangle,
  type RenderTexture,
  Sprite,
  Texture,
} from 'pixi.js';

import type { Picture } from '../bake/bakery';
import { rgbNumber } from '../core/color';
import type { GlNode } from '../core/scene';
import type { GlArt, Painter } from '../paint/painter';
import { GRADIENT_TEXELS } from '../paint/rasters';
import { FADE_IN_MS, type FadeIns } from './fadeIns';
import type { FrameInfo, NodeState } from './nodeState';
import { statusOf, type TextureStore } from './textures';

export interface PixiPainterContext {
  store: TextureStore;
  frame: FrameInfo;
  fades: FadeIns;
  /** A picture's entry (created and queued for baking the first time). */
  picture(art: GlArt): Picture<RenderTexture>;
  /** The last baked picture with a holdKey the node showed, if still baked. */
  held(node: GlNode): Picture<RenderTexture> | undefined;
  hold(node: GlNode, picture: Picture<RenderTexture>): void;
}

/**
 * A Painter drawing a node's paint as Pixi display objects into `state.drawn`. `baking`: drawing a
 * picture into its texture (images show at once, no fade).
 */
export function createPixiPainter(
  context: PixiPainterContext,
  node: GlNode,
  state: NodeState,
  baking: boolean
): Painter {
  const { store, frame, fades } = context;
  const add = <T extends Container>(object: T) => state.drawn.addChild(object);
  const fadeIn = (object: Container, readyAt: number, onDone?: () => void) =>
    !baking && fades.add(object, readyAt, node, frame.now, onDone);
  const text = (spec: Parameters<Painter['text']>[0]) => {
    const entry = store.text(spec);
    store.use(entry, node, state);
    return entry;
  };
  const painter: Painter = {
    rect(x, y, w, h, color, options) {
      const graphics = new Graphics();
      const radius = options?.radius ?? 0;
      const border = options?.border ?? 0;
      const fill = { color: rgbNumber(color), alpha: color[3] };
      if (border > 0) {
        const inset = border / 2;
        graphics
          .roundRect(x + inset, y + inset, w - border, h - border, Math.max(0, radius - inset))
          .stroke({ width: border, ...fill });
      } else if (radius > 0) {
        graphics.roundRect(x, y, w, h, radius).fill(fill);
      } else {
        graphics.rect(x, y, w, h).fill(fill);
      }
      add(graphics);
    },
    gradient(x, y, w, h, from, to, axis, options) {
      const entry = store.gradient(from, to, axis);
      store.use(entry, node, state);
      const radius = options?.radius ?? 0;
      if (radius > 0) {
        // The ramp's texel centres (0.5 to 255.5) over the box: Pixi makes a texture fill
        // repeat, and sampling past them would wrap to the other end
        const last = GRADIENT_TEXELS - 1;
        const sx = axis === 'x' ? w / last : w;
        const sy = axis === 'y' ? h / last : h;
        add(
          new Graphics().roundRect(x, y, w, h, radius).fill({
            texture: entry.texture!,
            matrix: new Matrix(
              sx,
              0,
              0,
              sy,
              axis === 'x' ? x - 0.5 * sx : x,
              axis === 'y' ? y - 0.5 * sy : y
            ),
            textureSpace: 'global',
          })
        );
      } else {
        const sprite = new Sprite(entry.texture!);
        sprite.position.set(x, y);
        sprite.width = w;
        sprite.height = h;
        add(sprite);
      }
    },
    image(src, x, y, w, h, options = {}) {
      const entry = store.image(src, w * state.scale);
      store.use(entry, node, state);
      if (entry.state === 'failed') return 'failed';
      if (entry.state !== 'ready') return 'loading';
      const imageRatio = entry.width / entry.height;
      const boxRatio = w / h;
      // The image's px shown (crop) and where
      let cropX = 0;
      let cropY = 0;
      let cropW = entry.width;
      let cropH = entry.height;
      if (options.fit === 'contain') {
        const alignX = options.alignX ?? 0.5;
        const alignY = options.alignY ?? 0.5;
        if (imageRatio > boxRatio) {
          const height = w / imageRatio;
          y += (h - height) * alignY;
          h = height;
        } else {
          const width = h * imageRatio;
          x += (w - width) * alignX;
          w = width;
        }
      } else if (imageRatio > boxRatio) {
        cropW = entry.height * boxRatio;
        cropX = (entry.width - cropW) / 2;
      } else {
        cropH = entry.width / boxRatio;
        cropY = (entry.height - cropH) / 2;
      }
      let object: Container;
      if (options.radius) {
        // Half a texel in from each edge: the fill repeats (see gradient). Less on an axis of a
        // texel or two, so the span stays above 0
        const insetX = Math.min(0.5, cropW / 4);
        const insetY = Math.min(0.5, cropH / 4);
        cropX += insetX;
        cropY += insetY;
        cropW -= insetX * 2;
        cropH -= insetY * 2;
        const k = w / cropW;
        object = new Graphics().roundRect(x, y, w, h, options.radius).fill({
          texture: entry.texture!,
          matrix: new Matrix(k, 0, 0, h / cropH, x - cropX * k, y - (cropY * h) / cropH),
          textureSpace: 'global',
        });
      } else {
        const texture =
          cropX || cropY
            ? new Texture({
                source: entry.texture!.source,
                frame: new Rectangle(cropX, cropY, cropW, cropH),
              })
            : entry.texture!;
        if (texture !== entry.texture) state.owned.push(texture);
        const sprite = new Sprite(texture);
        sprite.position.set(x, y);
        sprite.width = w;
        sprite.height = h;
        object = sprite;
      }
      if (options.fade !== false) fadeIn(object, entry.readyAt);
      add(object);
      return 'ready';
    },
    load(src, width) {
      const entry = store.image(src, width);
      store.use(entry, node, state);
      return statusOf(entry);
    },
    measure(spec) {
      const entry = text(spec);
      return entry.state === 'ready' ? { width: entry.width, height: entry.height } : null;
    },
    text(spec, x, y, options) {
      const entry = text(spec);
      if (entry.state !== 'ready') return null;
      const sprite = new Sprite(entry.texture!);
      sprite.position.set(
        Math.round(x - entry.width * (options?.anchorX ?? 0)),
        Math.round(y - entry.height * (options?.anchorY ?? 0))
      );
      add(sprite);
      return { width: entry.width, height: entry.height };
    },
    canvas(key, width, height, draw, x, y, w, h) {
      const entry = store.canvas(key, width, height, draw);
      store.use(entry, node, state);
      if (entry.state !== 'ready') return false;
      const sprite = new Sprite(entry.texture!);
      sprite.position.set(x, y);
      sprite.width = w;
      sprite.height = h;
      add(sprite);
      return true;
    },
    art(art) {
      const show = (shown: Picture<RenderTexture>) => {
        if (!shown.users.has(node)) {
          shown.users.add(node);
          state.pictures.push(shown);
        }
        shown.lastUsed = frame.index;
      };
      const picture = context.picture(art);
      show(picture);
      // An earlier version of this drawing, still baked: shown until this one has faded in
      const held = art.holdKey ? context.held(node) : undefined;
      const previous =
        held && held !== picture && held.art.holdKey === art.holdKey ? held : undefined;
      if (!picture.texture || frame.now - picture.readyAt < FADE_IN_MS) {
        if (previous) {
          show(previous);
          const sprite = new Sprite(previous.texture!);
          sprite.width = art.width;
          sprite.height = art.height;
          add(sprite);
        } else art.placeholder?.(painter);
      }
      if (!picture.texture) return Boolean(previous);
      const sprite = new Sprite(picture.texture);
      sprite.width = art.width;
      sprite.height = art.height;
      // Over an earlier version: once opaque, paint again without it (it can be evicted)
      const fading = fadeIn(sprite, picture.readyAt, previous ? () => node.repaint() : undefined);
      add(sprite);
      // Held once faded in over an earlier version: a paint mid-fade still finds it to show under
      if (art.holdKey && (!fading || !previous)) context.hold(node, picture);
      return true;
    },
  };
  return painter;
}
