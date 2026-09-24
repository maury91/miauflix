import { describe, expect, it } from 'vitest';

import { getHomeAction, moveIndex } from './homeNavigation';

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
});
