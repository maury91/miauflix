import { describe, expect, it } from 'vitest';

import { pushBackdrop, revealBackdrop, settleBackdrop } from './backdrop-stack';

const names = (stack: ReadonlyArray<{ backdrop: string }>) => stack.map(layer => layer.backdrop);

describe('backdrop stack', () => {
  it('shows the first backdrop at once', () => {
    expect(pushBackdrop([], 'A', 1)).toEqual([{ id: 1, backdrop: 'A', visible: true }]);
  });

  it('fades each new backdrop in over the ones still on screen, never back to an older one', () => {
    let stack = pushBackdrop([], 'A', 1);
    stack = revealBackdrop(pushBackdrop(stack, 'B', 2), 2);
    // C arrives while B is still fading in: B stays under C instead of A reappearing.
    stack = pushBackdrop(stack, 'C', 3);
    expect(names(stack)).toEqual(['A', 'B', 'C']);
    expect(stack.map(layer => layer.visible)).toEqual([true, true, false]);
  });

  const revealedStack = () => {
    let stack = pushBackdrop([], 'A', 1);
    stack = revealBackdrop(pushBackdrop(stack, 'B', 2), 2);
    return revealBackdrop(pushBackdrop(stack, 'C', 3), 3);
  };

  it('drops the layers under a backdrop once it has fully faded in', () => {
    let stack = revealedStack();
    stack = settleBackdrop(stack, 3);
    expect(names(stack)).toEqual(['C']);
  });

  it('keeps layers added after the one that settled', () => {
    let stack = revealedStack();
    stack = settleBackdrop(stack, 2);
    expect(names(stack)).toEqual(['B', 'C']);
  });

  it('replaces a top layer that has not started fading in, as it is not on screen yet', () => {
    let stack = pushBackdrop([], 'A', 1);
    stack = pushBackdrop(stack, 'B', 2);
    stack = pushBackdrop(stack, 'C', 3);
    expect(names(stack)).toEqual(['A', 'C']);
  });

  it('caps the stack by dropping the oldest layer above the base', () => {
    let stack = pushBackdrop([], 'A', 1);
    for (const [id, name] of [
      [2, 'B'],
      [3, 'C'],
      [4, 'D'],
      [5, 'E'],
    ] as const) {
      stack = revealBackdrop(pushBackdrop(stack, name, id), id);
    }
    expect(names(stack)).toEqual(['A', 'C', 'D', 'E']);
  });

  it('keeps the same backdrop twice as separate layers', () => {
    let stack = revealBackdrop(pushBackdrop(pushBackdrop([], 'A', 1), 'B', 2), 2);
    stack = pushBackdrop(stack, 'A', 3);
    expect(stack.map(layer => layer.id)).toEqual([1, 2, 3]);
  });
});
