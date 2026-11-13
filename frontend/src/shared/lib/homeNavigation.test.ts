import { describe, expect, it } from 'vitest';

import { getHomeAction, moveIndex, resolveCarouselAction } from './homeNavigation';

describe('home navigation actions', () => {
  it('maps keyboard input to region actions', () => {
    expect(getHomeAction('ArrowLeft')).toBe('left');
    expect(getHomeAction('Enter')).toBe('confirm');
    expect(getHomeAction('Escape')).toBe('back');
    expect(getHomeAction('Tab')).toBeNull();
  });

  it('moves within a carousel and escapes left at its boundary', () => {
    expect(moveIndex('left', 2, 5)).toEqual({ type: 'handled' });
    expect(moveIndex('left', 0, 5)).toEqual({ type: 'escape', direction: 'left' });
    expect(moveIndex('right', 4, 5)).toEqual({ type: 'handled' });
    expect(moveIndex('up', 2, 5)).toEqual({ type: 'escape', direction: 'up' });
  });

  it('activates the selected media without making empty rows active', () => {
    expect(moveIndex('confirm', 2, 5)).toEqual({ type: 'activate' });
    expect(moveIndex('confirm', 0, 0)).toEqual({ type: 'ignored' });
  });

  it('returns state transitions for carousel inputs without touching the view', () => {
    expect(resolveCarouselAction('left', 0, 5, null)).toEqual({
      outcome: { type: 'escape', direction: 'left' },
    });
    expect(resolveCarouselAction('right', 2, 5, null)).toEqual({
      outcome: { type: 'handled' },
      nextIndex: 3,
    });
    expect(resolveCarouselAction('confirm', 2, 5, { mediaId: 42 })).toEqual({
      outcome: { type: 'activate' },
      activation: { mediaId: 42 },
    });
  });
});
