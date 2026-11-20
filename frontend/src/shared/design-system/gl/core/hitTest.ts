import type { GlNode } from './scene';

/**
 * The top-most node with a `target` whose box holds the canvas point (`x`, `y`, CSS px), as the
 * frame draws it: each node translated by (x, y) and scaled about its centre, inside its
 * ancestors' clips (a fade's clip starts at fade[0]). Children are above their parent, ordered by
 * `z`. Hidden nodes (opacity 0) and those without a box aren't hit; their children may be.
 * Rotation is ignored (only spinners turn).
 */
export function hitTest(root: GlNode, x: number, y: number): GlNode | null {
  return visit(root, x, y, 0, 0, 1, null);
}

interface Clip {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function visit(
  node: GlNode,
  px: number,
  py: number,
  tx: number,
  ty: number,
  s: number,
  clip: Clip | null
): GlNode | null {
  if (node.opacity <= 0) return null;
  // As SceneSync places it: the scale's pivot is the box's centre
  const localX = node.x + (node.width / 2) * (1 - node.scale);
  const localY = node.y + (node.height / 2) * (1 - node.scale);
  const scale = s * node.scale;
  const left = tx + s * localX;
  const top = ty + s * localY;
  const hasBox = node.width > 0 && node.height > 0;
  const right = left + node.width * scale;
  const bottom = top + node.height * scale;
  if (node.clip && hasBox) {
    const clipTop = top + (node.fade ? node.fade[0] : 0) * scale;
    clip = intersect(clip, { left, top: clipTop, right, bottom });
    if (!inside(clip, px, py)) return null;
  }
  const children = node.orderedChildren();
  for (let index = children.length - 1; index >= 0; index--) {
    const hit = visit(children[index], px, py, left, top, scale, clip);
    if (hit) return hit;
  }
  if (!node.target || !hasBox) return null;
  if (px < left || px >= right || py < top || py >= bottom) return null;
  return clip && !inside(clip, px, py) ? null : node;
}

function intersect(a: Clip | null, b: Clip): Clip {
  if (!a) return b;
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

function inside(clip: Clip, x: number, y: number) {
  return x >= clip.left && x < clip.right && y >= clip.top && y < clip.bottom;
}
