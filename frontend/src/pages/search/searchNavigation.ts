import type { SearchFocus, SearchZone } from '@store/slices/search';

export const KEYBOARD_COLUMNS = 6;
export const KEYBOARD_CHARACTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'];
const CHARACTER_ROWS = KEYBOARD_CHARACTERS.length / KEYBOARD_COLUMNS;
/** Action keys after the characters, each spanning half the row. */
export const KEYBOARD_BACKSPACE = KEYBOARD_CHARACTERS.length;
export const KEYBOARD_SPACE = KEYBOARD_BACKSPACE + 1;
export const KEYBOARD_ACTION_SPAN = KEYBOARD_COLUMNS / 2;
export const POPULAR_COLUMNS = 5;
export const MAX_RECENT_CHIPS = 5;

export type SearchDirection = 'down' | 'left' | 'right' | 'up';

export interface SearchZoneCounts {
  popular: number;
  recents: number;
  results: number;
}

const at = (zone: SearchZone, index: number): SearchFocus => ({ zone, index });
const BACK: SearchFocus = { zone: 'back', index: 0 };

/** Grid position of a keyboard key; action keys report their first column. */
function keyPosition(index: number): { row: number; column: number } {
  if (index < KEYBOARD_BACKSPACE)
    return { row: Math.floor(index / KEYBOARD_COLUMNS), column: index % KEYBOARD_COLUMNS };
  return { row: CHARACTER_ROWS, column: (index - KEYBOARD_BACKSPACE) * KEYBOARD_ACTION_SPAN };
}

export const isCharacterKey = (index: number) => index >= 0 && index < KEYBOARD_BACKSPACE;

/**
 * Coming back into the keyboard returns to the last character key when it sits on the edge
 * being entered (e.g. 8 → down → space → up lands on 8 again); otherwise the default key.
 */
function enterKeyboard(
  lastKey: number,
  fallback: number,
  onEdge: (position: { row: number; column: number }) => boolean
): SearchFocus {
  return at(
    'keyboard',
    isCharacterKey(lastKey) && onEdge(keyPosition(lastKey)) ? lastKey : fallback
  );
}

/** First available zone of the right column, starting at the one beside the keyboard row. */
function rightColumnFrom(
  start: 'popular' | 'recents' | 'results',
  counts: SearchZoneCounts,
  index = 0
): SearchFocus | null {
  const zones = ['popular', 'recents', 'results'] as const;
  const ordered = [...zones.slice(zones.indexOf(start)), ...zones.slice(0, zones.indexOf(start))];
  const zone = ordered.find(candidate => counts[candidate] > 0);
  return zone ? at(zone, Math.min(index, counts[zone] - 1)) : null;
}

function moveKeyboard(
  index: number,
  direction: SearchDirection,
  counts: SearchZoneCounts,
  lastKey: number
): SearchFocus | null {
  const { row, column } = keyPosition(index);
  const actionRow = index >= KEYBOARD_BACKSPACE;
  switch (direction) {
    case 'up':
      if (row === 0) return at('input', 0);
      if (!actionRow) return at('keyboard', index - KEYBOARD_COLUMNS);
      return enterKeyboard(
        lastKey,
        (CHARACTER_ROWS - 1) * KEYBOARD_COLUMNS + column,
        key =>
          key.row === CHARACTER_ROWS - 1 &&
          key.column >= column &&
          key.column < column + KEYBOARD_ACTION_SPAN
      );
    case 'down':
      if (actionRow) return null;
      if (row === CHARACTER_ROWS - 1)
        return at('keyboard', KEYBOARD_BACKSPACE + Math.floor(column / KEYBOARD_ACTION_SPAN));
      return at('keyboard', index + KEYBOARD_COLUMNS);
    case 'left':
      if (actionRow) return index === KEYBOARD_BACKSPACE ? BACK : at('keyboard', index - 1);
      return column === 0 ? BACK : at('keyboard', index - 1);
    case 'right':
      if (actionRow ? index < KEYBOARD_SPACE : column < KEYBOARD_COLUMNS - 1)
        return at('keyboard', index + 1);
      if (row <= 1) return rightColumnFrom('popular', counts, row * POPULAR_COLUMNS);
      if (row <= 3) return rightColumnFrom('recents', counts);
      return rightColumnFrom('results', counts);
  }
}

/** Moving left out of the right column: the last key if it is on the right edge, else the key beside. */
const keyboardBeside = (row: number, lastKey: number) =>
  enterKeyboard(
    lastKey,
    row * KEYBOARD_COLUMNS + KEYBOARD_COLUMNS - 1,
    key => key.column === KEYBOARD_COLUMNS - 1
  );

/**
 * Move D-pad focus on the search page; null when the move goes nowhere. `lastKey` is the last
 * character key that had focus, so leaving and re-entering the keyboard returns to it.
 */
export function moveSearchFocus(
  focus: SearchFocus,
  direction: SearchDirection,
  counts: SearchZoneCounts,
  lastKey = 0
): SearchFocus | null {
  const { zone, index } = focus;
  switch (zone) {
    case 'back':
      return direction === 'right' || direction === 'down'
        ? enterKeyboard(lastKey, 0, key => key.column === 0)
        : null;
    case 'input':
      if (direction === 'down') return enterKeyboard(lastKey, 0, key => key.row === 0);
      return direction === 'left' ? BACK : null;
    case 'keyboard':
      return moveKeyboard(index, direction, counts, lastKey);
    case 'popular': {
      const column = index % POPULAR_COLUMNS;
      const row = Math.floor(index / POPULAR_COLUMNS);
      const lastRow = Math.floor((counts.popular - 1) / POPULAR_COLUMNS);
      if (direction === 'left')
        return column === 0 ? keyboardBeside(row, lastKey) : at('popular', index - 1);
      if (direction === 'right')
        return column < POPULAR_COLUMNS - 1 && index < counts.popular - 1
          ? at('popular', index + 1)
          : null;
      if (direction === 'up')
        return row === 0 ? at('input', 0) : at('popular', index - POPULAR_COLUMNS);
      if (row < lastRow)
        return at('popular', Math.min(index + POPULAR_COLUMNS, counts.popular - 1));
      if (counts.recents) return at('recents', Math.min(column, counts.recents - 1));
      return counts.results ? at('results', Math.min(column, counts.results - 1)) : null;
    }
    case 'recents':
      if (direction === 'left')
        return index === 0 ? keyboardBeside(2, lastKey) : at('recents', index - 1);
      if (direction === 'right')
        return index < counts.recents - 1 ? at('recents', index + 1) : null;
      if (direction === 'up') {
        if (!counts.popular) return at('input', 0);
        const lastRowStart = Math.floor((counts.popular - 1) / POPULAR_COLUMNS) * POPULAR_COLUMNS;
        return at('popular', Math.min(lastRowStart + index, counts.popular - 1));
      }
      return counts.results ? at('results', Math.min(index, counts.results - 1)) : null;
    case 'results':
      if (direction === 'left')
        return index === 0 ? keyboardBeside(4, lastKey) : at('results', index - 1);
      if (direction === 'right')
        return index < counts.results - 1 ? at('results', index + 1) : null;
      if (direction === 'up') {
        if (counts.recents) return at('recents', Math.min(index, counts.recents - 1));
        if (!counts.popular) return at('input', 0);
        const lastRowStart = Math.floor((counts.popular - 1) / POPULAR_COLUMNS) * POPULAR_COLUMNS;
        return at('popular', Math.min(lastRowStart + index, counts.popular - 1));
      }
      return null;
  }
}

/** Keep a remembered focus valid after the zones' contents changed. */
export function clampSearchFocus(focus: SearchFocus, counts: SearchZoneCounts): SearchFocus {
  if (focus.zone === 'keyboard') return at('keyboard', Math.min(focus.index, KEYBOARD_SPACE));
  if (focus.zone === 'popular' || focus.zone === 'recents' || focus.zone === 'results') {
    const count = counts[focus.zone];
    return count ? at(focus.zone, Math.min(focus.index, count - 1)) : at('keyboard', 0);
  }
  return focus;
}
