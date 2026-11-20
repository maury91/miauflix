import { describe, expect, it, vi } from 'vitest';

import { motion } from './motion';
import { GlNode, releaseTree, stepAnimations } from './scene';

const linear = (progress: number) => progress;

function rootWithOwner() {
  const root = new GlNode();
  const owner = { invalidate: vi.fn() };
  root.owner = owner;
  return { root, owner };
}

describe('GlNode', () => {
  it('tells the root owner of a change below it, marking the path changed', () => {
    const { root, owner } = rootWithOwner();
    const parent = new GlNode();
    const child = new GlNode();
    root.add(parent);
    parent.add(child);
    root.changed = parent.changed = child.changed = false;
    owner.invalidate.mockClear();

    child.set({ x: 10 });

    expect(owner.invalidate).toHaveBeenCalledTimes(1);
    expect([root.changed, parent.changed, child.changed]).toEqual([true, true, true]);
  });

  it('ignores a set that changes nothing', () => {
    const { root, owner } = rootWithOwner();
    root.set({ width: 100 });
    owner.invalidate.mockClear();

    root.set({ width: 100, x: undefined });

    expect(owner.invalidate).not.toHaveBeenCalled();
  });

  it('moves a child to its new parent', () => {
    const a = new GlNode();
    const b = new GlNode();
    const child = new GlNode();
    a.add(child);
    b.add(child);

    expect(a.children).toEqual([]);
    expect(b.children).toEqual([child]);
    expect(child.parent).toBe(b);
  });

  it('orders children by z, then by insertion', () => {
    const parent = new GlNode();
    const [first, second, third] = [new GlNode(), new GlNode(), new GlNode()];
    parent.add(first);
    parent.add(second);
    parent.add(third);
    second.set({ z: -1 });

    expect(parent.orderedChildren()).toEqual([second, first, third]);
  });

  it('keeps insertion order for equal z after an earlier sort reordered them', () => {
    const parent = new GlNode();
    const [a, b] = [new GlNode(), new GlNode()];
    a.set({ z: 2 });
    b.set({ z: 1 });
    parent.add(a);
    parent.add(b);
    expect(parent.orderedChildren()).toEqual([b, a]);

    a.set({ z: 1 });

    expect(parent.orderedChildren()).toEqual([a, b]);
  });

  it('animates from where it is, mid-animation too', () => {
    const node = new GlNode();
    node.animate('x', 100, 100, linear);

    expect(node.step(1000)).toBe(true);
    expect(node.x).toBe(0);
    node.step(1050);
    expect(node.x).toBe(50);

    // Retargeted halfway: starts from 50
    node.animate('x', 0, 100, linear);
    node.step(1050);
    node.step(1100);
    expect(node.x).toBe(25);
  });

  it('lands an animation and reports it', () => {
    const node = new GlNode();
    const onSettle = vi.fn();
    node.onSettle = onSettle;
    node.animate('opacity', 0, 100, linear);
    node.step(0);

    expect(node.step(100)).toBe(false);
    expect(node.opacity).toBe(0);
    expect(node.animations).toEqual({});
    expect(onSettle).toHaveBeenCalledWith('opacity');
  });

  it('lets a set win over a running animation', () => {
    const node = new GlNode();
    node.animate('y', 100, 100, linear);
    node.set({ y: 30 });

    expect(node.animations).toEqual({});
    expect(node.y).toBe(30);
  });

  it('lets a set to the current value end a running animation', () => {
    const node = new GlNode();
    node.animate('y', -100, 100, linear);
    node.set({ y: 0 });
    node.step(0);
    node.step(50);

    expect(node.animations).toEqual({});
    expect(node.y).toBe(0);
  });

  it('does not restart an animation already heading there', () => {
    const node = new GlNode();
    node.animate('x', 100, 100, linear);
    node.step(0);
    node.step(50);
    node.animate('x', 100, 100, linear);
    node.step(100);

    expect(node.x).toBe(100);
  });

  it('marks a repaint and asks for a frame', () => {
    const { root, owner } = rootWithOwner();
    root.paintDirty = false;
    owner.invalidate.mockClear();

    root.repaint();

    expect(root.paintDirty).toBe(true);
    expect(owner.invalidate).toHaveBeenCalledTimes(1);
  });
});

describe('stepAnimations', () => {
  it('steps every animated node in the tree and says whether any still runs', () => {
    const root = new GlNode();
    const child = new GlNode();
    const still = new GlNode();
    root.add(child);
    root.add(still);
    child.animate('scale', 2, 100, linear);
    child.changed = still.changed = false;

    expect(stepAnimations(root, 0)).toBe(true);
    expect(child.changed).toBe(true);
    expect(still.changed).toBe(false);
    expect(stepAnimations(root, 100)).toBe(false);
    expect(child.scale).toBe(2);
  });

  it('stops stepping a spinner deep in a removed subtree, and resumes it when it is back', () => {
    const root = new GlNode();
    const branch = new GlNode();
    const spinner = new GlNode();
    root.add(branch);
    branch.add(spinner);
    spinner.set({ spin: 1000 });
    expect(stepAnimations(root, 250)).toBe(true);

    root.remove(branch);
    // Off the tree it isn't stepped, even as the root of its own subtree
    expect(stepAnimations(branch, 500)).toBe(false);
    expect(spinner.rotation).toBeCloseTo(Math.PI / 2);

    root.add(branch);
    expect(stepAnimations(root, 750)).toBe(true);
    expect(spinner.rotation).toBeCloseTo((Math.PI * 3) / 2);
  });

  it('keeps a removed spinner still through changes made while it is off the tree', () => {
    const root = new GlNode();
    const branch = new GlNode();
    const spinner = new GlNode();
    root.add(branch);
    branch.add(spinner);
    spinner.set({ spin: 1000 });
    stepAnimations(root, 250);

    root.remove(branch);
    spinner.set({ x: 1 });
    spinner.animate('scale', 2, 100, linear);
    expect(stepAnimations(branch, 500)).toBe(false);
    expect(spinner.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('stands still a spinner whose spin stopped while it was off the tree', () => {
    const root = new GlNode();
    const spinner = new GlNode();
    root.add(spinner);
    spinner.set({ spin: 1000 });
    stepAnimations(root, 250);

    root.remove(spinner);
    spinner.set({ spin: 0 });
    root.add(spinner);
    expect(stepAnimations(root, 500)).toBe(false);
    expect(spinner.rotation).toBe(0);
  });

  it('stops stepping a released tree', () => {
    const root = new GlNode();
    const spinner = new GlNode();
    root.add(spinner);
    spinner.set({ spin: 1000 });
    stepAnimations(root, 250);

    releaseTree(root);
    spinner.set({ x: 1 });
    expect(stepAnimations(root, 500)).toBe(false);
  });
});

describe('motion', () => {
  it('lands animations on the next frame under reduced motion, settling as usual', () => {
    motion.reduced = true;
    try {
      const node = new GlNode();
      const settled = vi.fn();
      node.onSettle = settled;
      node.animate('x', 100, 300, linear);
      expect(node.x).toBe(0);

      expect(stepAnimations(node, 1000)).toBe(false);
      expect(node.x).toBe(100);
      expect(settled).toHaveBeenCalledWith('x');
    } finally {
      motion.reduced = false;
    }
  });

  it('turns a spinning node once per period, and stands it still under reduced motion', () => {
    const node = new GlNode();
    node.set({ spin: 1000 });
    expect(stepAnimations(node, 2250)).toBe(true);
    expect(node.rotation).toBeCloseTo(Math.PI / 2);

    motion.reduced = true;
    try {
      expect(stepAnimations(node, 2500)).toBe(false);
      expect(node.rotation).toBe(0);
    } finally {
      motion.reduced = false;
    }

    node.set({ spin: 0 });
    expect(stepAnimations(node, 2750)).toBe(false);
  });
});
