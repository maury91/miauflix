import type { Container } from 'pixi.js';

import { motion } from '../core/motion';
import type { GlNode } from '../core/scene';

/** How long a texture that just became ready takes to fade in. */
export const FADE_IN_MS = 180;

/** Display objects fading in (images, pictures just ready), stepped each frame. */
export class FadeIns {
  private fades: Array<{
    object: Container;
    readyAt: number;
    node: GlNode;
    onDone?: () => void;
  }> = [];

  /** Starts the object at its alpha for `now` if it became ready less than FADE_IN_MS ago. */
  add(object: Container, readyAt: number, node: GlNode, now: number, onDone?: () => void) {
    if (motion.reduced || now - readyAt >= FADE_IN_MS) return false;
    object.alpha = Math.max(0, (now - readyAt) / FADE_IN_MS);
    this.fades.push({ object, readyAt, node, onDone });
    return true;
  }

  /** The node's paint is gone (repainted, removed). */
  drop(node: GlNode) {
    if (this.fades.length) this.fades = this.fades.filter(fade => fade.node !== node);
  }

  /** Advances them; their nodes count as changed (a baked layer showing one re-bakes). */
  step(now: number) {
    this.fades = this.fades.filter(fade => {
      const progress = Math.min(1, (now - fade.readyAt) / FADE_IN_MS);
      fade.object.alpha = progress;
      fade.node.changed = true;
      if (progress < 1) return true;
      fade.onDone?.();
      return false;
    });
  }

  get size() {
    return this.fades.length;
  }

  clear() {
    this.fades = [];
  }
}
