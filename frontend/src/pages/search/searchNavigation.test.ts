import { describe, expect, it } from 'vitest';

import {
  clampSearchFocus,
  KEYBOARD_BACKSPACE,
  KEYBOARD_SPACE,
  moveSearchFocus,
} from './searchNavigation';

const counts = { popular: 10, recents: 5, results: 20 };
const keyboard = (index: number) => ({ zone: 'keyboard' as const, index });

describe('moveSearchFocus', () => {
  it('moves through the character grid and onto the action row', () => {
    expect(moveSearchFocus(keyboard(0), 'right', counts)).toEqual(keyboard(1));
    expect(moveSearchFocus(keyboard(0), 'down', counts)).toEqual(keyboard(6));
    expect(moveSearchFocus(keyboard(32), 'down', counts)).toEqual(keyboard(KEYBOARD_BACKSPACE));
    expect(moveSearchFocus(keyboard(33), 'down', counts)).toEqual(keyboard(KEYBOARD_SPACE));
    expect(moveSearchFocus(keyboard(35), 'down', counts)).toEqual(keyboard(KEYBOARD_SPACE));
    expect(moveSearchFocus(keyboard(KEYBOARD_SPACE), 'up', counts)).toEqual(keyboard(33));
    expect(moveSearchFocus(keyboard(KEYBOARD_SPACE), 'down', counts)).toBeNull();
  });

  it('leaves the keyboard for the input, the sidebar and the zone beside the row', () => {
    expect(moveSearchFocus(keyboard(2), 'up', counts)).toEqual({ zone: 'input', index: 0 });
    expect(moveSearchFocus(keyboard(12), 'left', counts)).toEqual({ zone: 'back', index: 0 });
    expect(moveSearchFocus(keyboard(KEYBOARD_BACKSPACE), 'left', counts)).toEqual({
      zone: 'back',
      index: 0,
    });
    expect(moveSearchFocus(keyboard(5), 'right', counts)).toEqual({ zone: 'popular', index: 0 });
    expect(moveSearchFocus(keyboard(11), 'right', counts)).toEqual({ zone: 'popular', index: 5 });
    expect(moveSearchFocus(keyboard(17), 'right', counts)).toEqual({ zone: 'recents', index: 0 });
    expect(moveSearchFocus(keyboard(KEYBOARD_SPACE), 'right', counts)).toEqual({
      zone: 'results',
      index: 0,
    });
  });

  it('skips empty zones when leaving the keyboard', () => {
    const noRecents = { popular: 10, recents: 0, results: 0 };
    expect(moveSearchFocus(keyboard(17), 'right', noRecents)).toEqual({
      zone: 'popular',
      index: 0,
    });
  });

  it('walks the right column from chips to results and back', () => {
    expect(moveSearchFocus({ zone: 'popular', index: 2 }, 'down', counts)).toEqual({
      zone: 'popular',
      index: 7,
    });
    expect(moveSearchFocus({ zone: 'popular', index: 7 }, 'down', counts)).toEqual({
      zone: 'recents',
      index: 2,
    });
    expect(moveSearchFocus({ zone: 'recents', index: 4 }, 'down', counts)).toEqual({
      zone: 'results',
      index: 4,
    });
    expect(moveSearchFocus({ zone: 'results', index: 9 }, 'up', counts)).toEqual({
      zone: 'recents',
      index: 4,
    });
    expect(moveSearchFocus({ zone: 'recents', index: 1 }, 'up', counts)).toEqual({
      zone: 'popular',
      index: 6,
    });
    expect(moveSearchFocus({ zone: 'results', index: 1 }, 'up', { ...counts, recents: 0 })).toEqual(
      { zone: 'popular', index: 6 }
    );
    expect(moveSearchFocus({ zone: 'popular', index: 0 }, 'up', counts)).toEqual({
      zone: 'input',
      index: 0,
    });
  });

  it('returns to the keyboard from the left edge of each zone', () => {
    expect(moveSearchFocus({ zone: 'popular', index: 5 }, 'left', counts)).toEqual(keyboard(11));
    expect(moveSearchFocus({ zone: 'recents', index: 0 }, 'left', counts)).toEqual(keyboard(17));
    expect(moveSearchFocus({ zone: 'results', index: 0 }, 'left', counts)).toEqual(keyboard(29));
    expect(moveSearchFocus({ zone: 'results', index: 3 }, 'left', counts)).toEqual({
      zone: 'results',
      index: 2,
    });
  });

  it('returns from the back button to the keyboard', () => {
    expect(moveSearchFocus({ zone: 'back', index: 0 }, 'right', counts)).toEqual(keyboard(0));
    expect(moveSearchFocus({ zone: 'back', index: 0 }, 'up', counts)).toBeNull();
  });

  it('returns to the last character key when re-entering the keyboard', () => {
    // 8 → down → space → up lands on 8, not on the first key above the space bar.
    const eight = 33;
    expect(moveSearchFocus(keyboard(KEYBOARD_SPACE), 'up', counts, eight)).toEqual(keyboard(eight));
    expect(moveSearchFocus(keyboard(KEYBOARD_BACKSPACE), 'up', counts, eight)).toEqual(
      keyboard(30)
    );
    // X → right → recents → left lands on X, not on R beside the recents row.
    const x = 23;
    expect(moveSearchFocus({ zone: 'recents', index: 0 }, 'left', counts, x)).toEqual(keyboard(x));
    expect(moveSearchFocus({ zone: 'results', index: 0 }, 'left', counts, x)).toEqual(keyboard(x));
    expect(moveSearchFocus({ zone: 'popular', index: 0 }, 'left', counts, 2)).toEqual(keyboard(5));
    // The back button and the search box return to it from their side.
    expect(moveSearchFocus({ zone: 'back', index: 0 }, 'right', counts, 12)).toEqual(keyboard(12));
    expect(moveSearchFocus({ zone: 'input', index: 0 }, 'down', counts, 3)).toEqual(keyboard(3));
    expect(moveSearchFocus({ zone: 'input', index: 0 }, 'down', counts, 12)).toEqual(keyboard(0));
  });

  it('stops at the end of a row', () => {
    expect(moveSearchFocus({ zone: 'popular', index: 4 }, 'right', counts)).toBeNull();
    expect(moveSearchFocus({ zone: 'results', index: 19 }, 'right', counts)).toBeNull();
  });
});

describe('clampSearchFocus', () => {
  it('keeps focus inside zones that shrank or emptied', () => {
    expect(clampSearchFocus({ zone: 'results', index: 8 }, { ...counts, results: 3 })).toEqual({
      zone: 'results',
      index: 2,
    });
    expect(clampSearchFocus({ zone: 'results', index: 8 }, { ...counts, results: 0 })).toEqual(
      keyboard(0)
    );
  });
});
