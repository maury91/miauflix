import { describe, expect, it } from 'vitest';

import { hitTest } from './hitTest';
import { GlNode } from './scene';

const target = () => document.createElement('button');

function node(props: Partial<GlNode>, children: GlNode[] = []) {
  const created = new GlNode();
  Object.assign(created, props);
  for (const child of children) created.add(child);
  return created;
}

describe('hitTest', () => {
  it('finds the node under the point through its ancestors’ offsets', () => {
    const tile = node({ x: 10, width: 100, height: 50, target: target() });
    const root = node({ width: 500, height: 500 }, [node({ x: 20, y: 30 }, [tile])]);

    expect(hitTest(root, 31, 31)).toBe(tile);
    expect(hitTest(root, 129, 79)).toBe(tile);
    expect(hitTest(root, 130, 50)).toBeNull();
    expect(hitTest(root, 50, 29)).toBeNull();
  });

  it('follows a scale about the box centre, of the node and its ancestors', () => {
    // 100 × 100 scaled 1.1 about (50, 50): from -5 to 105
    const tile = node({ width: 100, height: 100, scale: 1.1, target: target() });
    const root = node({}, [tile]);
    expect(hitTest(root, -4, -4)).toBe(tile);
    expect(hitTest(root, 104, 104)).toBe(tile);
    expect(hitTest(root, 106, 50)).toBeNull();

    // A group scaled 2 about its centre (0, 0 to 200): its child at x 50 lands at 100
    const child = node({ x: 50, width: 10, height: 10, target: target() });
    const group = node({ width: 200, height: 200, scale: 2 }, [child]);
    // The group spans -100 to 300; the child from -100 + 100 to + 20
    expect(hitTest(node({}, [group]), 5, -95)).toBe(child);
    expect(hitTest(node({}, [group]), -5, -95)).toBeNull();
  });

  it('picks the top-most: later and higher z first, children over their parent', () => {
    const below = node({ width: 100, height: 100, target: target() });
    const above = node({ width: 100, height: 100, target: target() });
    const root = node({}, [above, below]);
    above.set({ z: 1 });
    expect(hitTest(root, 50, 50)).toBe(above);

    const child = node({ x: 40, y: 40, width: 20, height: 20, target: target() });
    const parent = node({ width: 100, height: 100, target: target() }, [child]);
    expect(hitTest(node({}, [parent]), 50, 50)).toBe(child);
    expect(hitTest(node({}, [parent]), 10, 10)).toBe(parent);
  });

  it('passes through nodes without a target, and skips hidden ones', () => {
    const tile = node({ width: 100, height: 100, target: target() });
    const cover = node({ width: 100, height: 100 });
    expect(hitTest(node({}, [tile, cover]), 50, 50)).toBe(tile);

    tile.set({ opacity: 0 });
    expect(hitTest(node({}, [tile]), 50, 50)).toBeNull();
  });

  it('stays inside a clip, which a fade starts at its edge', () => {
    const tile = node({ y: 0, width: 100, height: 100, target: target() });
    const scroller = node({ y: 50, width: 100, height: 100, clip: true }, [
      node({ y: -50 }, [tile]),
    ]);
    // The tile spans 0 to 100, the clip 50 to 150
    expect(hitTest(node({}, [scroller]), 50, 40)).toBeNull();
    expect(hitTest(node({}, [scroller]), 50, 60)).toBe(tile);

    scroller.fade = [20, 40];
    expect(hitTest(node({}, [scroller]), 50, 60)).toBeNull();
    expect(hitTest(node({}, [scroller]), 50, 75)).toBe(tile);
  });
});
