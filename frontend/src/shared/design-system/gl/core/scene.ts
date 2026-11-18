import type { Painter } from '../paint/painter';
import type { Easing } from './easing';

interface Animation {
  from: number;
  to: number;
  duration: number;
  easing: Easing;
  /** Set on the first frame that sees the animation, so the render before it isn't skipped. */
  start: number | null;
}

export type AnimatedProperty = 'x' | 'y' | 'scale' | 'opacity';

/**
 * One node of the retained scene: a transform (translate, and scale about its centre), an
 * optional clip to its box, an opacity, and a paint callback for its own primitives. Children
 * paint above their parent, ordered by `z` and then by insertion.
 */
export class GlNode {
  x = 0;
  y = 0;
  scale = 1;
  opacity = 1;
  z = 0;
  /** The box: the clip, the scale's pivot, and culling (0 = unbounded, never culled). */
  width = 0;
  height = 0;
  clip = false;
  /**
   * Alpha ramps from 0 at local y = fade[0] to 1 at fade[1], for this node and its children: drawn
   * as a copy of `fadeFrom` (a node under this one, in canvas coordinates) over the ramp, opaque
   * at fade[0], so it shows through without an alpha mask pass. Its clip starts at fade[0].
   */
  fade: [number, number] | null = null;
  fadeFrom: GlNode | null = null;
  /**
   * Drawn as one picture: the subtree is rendered into a texture (its box) whenever something in
   * it changes, and shown as one sprite. For layers that change rarely but are costly to draw.
   */
  bake = false;
  paint: ((painter: Painter) => void) | null = null;
  children: GlNode[] = [];
  parent: GlNode | null = null;
  /** Who draws the tree, on the root (set by the surface): told of every change. */
  owner: { invalidate: () => void } | null = null;
  animations: Partial<Record<AnimatedProperty, Animation>> = {};
  /** Called when an animation of this node lands (from the frame loop). */
  onSettle: ((property: AnimatedProperty) => void) | null = null;
  private sorted = true;
  /** Set by any change in this node or below since the renderer last looked (a bake's cue). */
  changed = true;
  /** The paint callback must run again (new props, a texture ready). */
  paintDirty = true;

  add(child: GlNode) {
    if (child.parent === this) return;
    child.parent?.remove(child);
    child.parent = this;
    this.children.push(child);
    this.sorted = false;
    this.invalidate();
  }

  remove(child: GlNode) {
    const index = this.children.indexOf(child);
    if (index < 0) return;
    this.children.splice(index, 1);
    child.parent = null;
    this.invalidate();
  }

  /** Change properties; the next frame draws them. Unchanged values cost nothing. */
  set(props: Partial<Pick<GlNode, 'width' | 'height' | 'clip' | 'z' | 'bake' | AnimatedProperty>>) {
    let changed = false;
    for (const key in props) {
      const value = props[key as keyof typeof props];
      if (value === undefined || this[key as keyof this] === value) continue;
      if (key === 'z') this.parent?.markUnsorted();
      // A set wins over a running animation of the same property
      delete this.animations[key as AnimatedProperty];
      (this as Record<string, unknown>)[key] = value;
      changed = true;
    }
    if (changed) this.invalidate();
  }

  /** Animate a property to `to` from where it is now (mid-animation, from its current value). */
  animate(property: AnimatedProperty, to: number, duration: number, easing: Easing) {
    const running = this.animations[property];
    if (running ? running.to === to : this[property] === to) return;
    this.animations[property] = { from: this[property], to, duration, easing, start: null };
    this.invalidate();
  }

  /** Advance animations to `now`; true while any still runs. */
  step(now: number): boolean {
    let running = false;
    for (const key in this.animations) {
      const property = key as AnimatedProperty;
      const animation = this.animations[property]!;
      if (animation.start === null) animation.start = now;
      const progress = animation.duration > 0 ? (now - animation.start) / animation.duration : 1;
      if (progress >= 1) {
        this[property] = animation.to;
        delete this.animations[property];
        this.onSettle?.(property);
      } else {
        this[property] =
          animation.from + (animation.to - animation.from) * animation.easing(progress);
        running = true;
      }
    }
    return running;
  }

  orderedChildren() {
    if (!this.sorted) {
      // Stable: equal z keeps insertion order
      const indexed = this.children.map((child, index) => ({ child, index }));
      indexed.sort((a, b) => a.child.z - b.child.z || a.index - b.index);
      this.children = indexed.map(entry => entry.child);
      this.sorted = true;
    }
    return this.children;
  }

  markUnsorted() {
    this.sorted = false;
  }

  /** Paint again on the next frame. */
  repaint() {
    this.paintDirty = true;
    this.invalidate();
  }

  invalidate() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- walks up from here
    let node: GlNode = this;
    node.changed = true;
    while (node.parent) {
      node = node.parent;
      node.changed = true;
    }
    node.owner?.invalidate();
  }
}

/**
 * Advances every animation in the tree to `now`; animated nodes count as changed. True while any
 * still runs.
 */
export function stepAnimations(root: GlNode, now: number): boolean {
  let running = false;
  const visit = (node: GlNode) => {
    if (Object.keys(node.animations).length) {
      node.changed = true;
      if (node.step(now)) running = true;
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return running;
}
