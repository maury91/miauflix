import { describe, expect, it, vi } from 'vitest';

import { GlNode } from '../core/scene';
import type { GlArt } from '../paint/painter';
import { Bakery } from './bakery';

const art = (key: string): GlArt => ({ key, width: 10, height: 10, draw: () => undefined });

function bakery() {
  return new Bakery<{ id: string }>(() => new GlNode());
}

describe('Bakery', () => {
  it('shares one picture per key and device pixel ratio', () => {
    const pictures = bakery();
    const a = pictures.picture(art('tile:1'), 1, 0);

    expect(pictures.picture(art('tile:1'), 1, 5)).toBe(a);
    expect(pictures.picture(art('tile:1'), 2, 5)).not.toBe(a);
    // A new font epoch: drawn again
    expect(pictures.picture(art('tile:1'), 1, 5, 1)).not.toBe(a);
    expect(pictures.ofStandIn(a.standIn)).toBe(a);
  });

  it('bakes a scaled picture at the device pixel ratio times its scale', () => {
    const pictures = bakery();
    const focusable = pictures.picture({ ...art('tile:1'), scale: 1.03 }, 2, 0);
    expect(focusable.resolution).toBeCloseTo(2.06);
    expect(pictures.picture(art('tile:1'), 2, 0).resolution).toBe(2);
  });

  it('gives the queue shown pictures first', () => {
    const pictures = bakery();
    const far = pictures.picture(art('far'), 1, 0);
    const shown = pictures.picture(art('shown'), 1, 0);
    far.users.add(new GlNode());
    shown.users.add(new GlNode());

    const due = pictures.due(picture => picture === shown, vi.fn());

    expect(due.map(entry => entry.picture)).toEqual([shown, far]);
    expect(due.map(entry => entry.shown)).toEqual([true, false]);
  });

  it('drops queued pictures nobody shows that were never baked', () => {
    const pictures = bakery();
    const abandoned = pictures.picture(art('abandoned'), 1, 0);
    const baked = pictures.picture(art('baked'), 1, 0);
    baked.texture = { id: 'baked' };
    const drop = vi.fn();

    expect(pictures.due(() => false, drop)).toEqual([]);
    expect(drop).toHaveBeenCalledWith(abandoned);
    expect(pictures.pictures.has(abandoned.key)).toBe(false);
    // Baked: kept (evictable), just no longer queued
    expect(pictures.pictures.has(baked.key)).toBe(true);
    expect(pictures.queued).toBe(0);
  });

  it('queues a taken picture again when asked', () => {
    const pictures = bakery();
    const picture = pictures.picture(art('a'), 1, 0);
    pictures.take(picture);
    expect(pictures.queued).toBe(0);

    pictures.requeue(picture);
    expect(pictures.queued).toBe(1);
  });

  it('hands every picture back on clear', () => {
    const pictures = bakery();
    const a = pictures.picture(art('a'), 1, 0);
    const b = pictures.picture(art('b'), 1, 0);

    expect(pictures.clear()).toEqual([a, b]);
    expect(pictures.pictures.size).toBe(0);
    expect(pictures.queued).toBe(0);
  });
});
