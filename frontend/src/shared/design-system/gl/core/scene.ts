import type { Painter } from '../paint/painter';
import type { Easing } from './easing';
import { motion, motionDuration } from './motion';

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
  /**
   * Turns once per `spin` ms about its centre while it's set (a spinner); 0 stands still, as
   * does every spin under reduced motion. `rotation` (radians) is stepped by the frame loop.
   */
  spin = 0;
  rotation = 0;
  /**
   * The element the pointer over this node's box goes to (its semantic twin): see `hitTest`.
   * Nodes without one are passed through.
   */
  target: Element | null = null;
  children: GlNode[] = [];
  parent: GlNode | null = null;
  /** Who draws the tree, on the root (set by the surface): told of every change. */
  owner: { invalidate: () => void } | null = null;
  animations: Partial<Record<AnimatedProperty, Animation>> = {};
  /** Called when an animation of this node lands (from the frame loop). */
  onSettle: ((property: AnimatedProperty) => void) | null = null;
  private sorted = true;
  /** When it was added to its parent: equal z paints in this order. */
  private insertion = 0;
  private static insertions = 0;
  /** Set by any change in this node or below since the renderer last looked (a bake's cue). */
  changed = true;
  /** The paint callback must run again (new props, a texture ready). */
  paintDirty = true;
  /**
   * Taken off its tree (`remove`) or its surface gone (`releaseTree`): nothing in the subtree is
   * stepped, whatever changes in it, until `add` puts it back.
   */
  detached = false;

  add(child: GlNode) {
    if (child.parent === this) return;
    child.parent?.remove(child);
    child.parent = this;
    child.insertion = ++GlNode.insertions;
    this.children.push(child);
    child.detached = false;
    if (!rootOf(this).detached) trackMoving(child, true);
    this.sorted = false;
    this.invalidate();
  }

  remove(child: GlNode) {
    const index = this.children.indexOf(child);
    if (index < 0) return;
    this.children.splice(index, 1);
    child.parent = null;
    // Off the tree, with all it holds: not stepped (an unmounted spinner would turn forever, and
    // keep the subtree alive); back with `add`
    child.detached = true;
    trackMoving(child, false);
    this.invalidate();
  }

  /** Change properties; the next frame draws them. Unchanged values cost nothing. */
  set(
    props: Partial<
      Pick<GlNode, 'width' | 'height' | 'clip' | 'z' | 'bake' | 'spin' | AnimatedProperty>
    >
  ) {
    let changed = false;
    for (const key in props) {
      const value = props[key as keyof typeof props];
      if (value === undefined) continue;
      // A set wins over a running animation of the same property, even to the value it has now
      if (this.animations[key as AnimatedProperty]) {
        delete this.animations[key as AnimatedProperty];
        changed = true;
      }
      if (this[key as keyof this] === value) continue;
      if (key === 'z') this.parent?.markUnsorted();
      (this as Record<string, unknown>)[key] = value;
      changed = true;
    }
    if (changed) {
      if (this.spin && !rootOf(this).detached) moving.add(this);
      this.invalidate();
    }
  }

  /**
   * Animate a property to `to` from where it is now (mid-animation, from its current value). Under
   * reduced motion it lands on the next frame.
   */
  animate(property: AnimatedProperty, to: number, duration: number, easing: Easing) {
    const running = this.animations[property];
    if (running ? running.to === to : this[property] === to) return;
    this.animations[property] = {
      from: this[property],
      to,
      duration: motionDuration(duration),
      easing,
      start: null,
    };
    if (!rootOf(this).detached) moving.add(this);
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
      // Equal z keeps insertion order (not the last sort's order)
      this.children.sort((a, b) => a.z - b.z || a.insertion - b.insertion);
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
    this.markChanged().owner?.invalidate();
  }

  /**
   * Marks this node and its ancestors changed (the frame visits that path; unchanged subtrees are
   * skipped), returning the root. From the frame loop itself, which needs no new frame.
   */
  markChanged(): GlNode {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- walks up from here
    let node: GlNode = this;
    node.changed = true;
    while (node.parent) {
      node = node.parent;
      node.changed = true;
    }
    return node;
  }
}

const TURN = Math.PI * 2;

/** Nodes with animations or a spin: all stepAnimations visits (not the whole tree). */
const moving = new Set<GlNode>();

/**
 * Puts the subtree's animated and spinning nodes in `moving` (attached) or takes them out. A node
 * left turned (its spin stopped while it was off the tree) goes in too: the next step stands it
 * still.
 */
function trackMoving(node: GlNode, attached: boolean) {
  if (!attached) {
    if (!moving.size) return;
    moving.delete(node);
  } else if (node.spin || node.rotation || Object.keys(node.animations).length) moving.add(node);
  for (const child of node.children) trackMoving(child, attached);
}

/** The surface showing `root` is gone: nothing under it is stepped, or kept by the frame loop. */
export function releaseTree(root: GlNode) {
  root.detached = true;
  trackMoving(root, false);
}

function rootOf(node: GlNode) {
  while (node.parent) node = node.parent;
  return node;
}

/**
 * Advances every animation in the tree to `now`; animated nodes and their ancestors count as
 * changed. True while any still runs.
 */
export function stepAnimations(root: GlNode, now: number): boolean {
  let running = false;
  for (const node of moving) {
    if (rootOf(node) !== root) continue;
    if (Object.keys(node.animations).length) {
      node.markChanged();
      if (node.step(now)) running = true;
    }
    const spinning = node.spin > 0 && !motion.reduced;
    const rotation = spinning ? ((now % node.spin) / node.spin) * TURN : 0;
    if (rotation !== node.rotation) {
      node.rotation = rotation;
      node.markChanged();
    }
    if (spinning) running = true;
    if (!node.spin && !Object.keys(node.animations).length) moving.delete(node);
  }
  return running;
}
