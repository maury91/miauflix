import type { ReactNode } from 'react';

/** One key of the on-screen keyboard. */
export type KeyboardKey =
  | {
      /** Stable identity, used for focus. */
      id: string;
      kind: 'character';
      /** What it types; also shown on the key and read as its name. */
      value: string;
      /** Columns spanned; 1 by default. */
      span?: number;
    }
  | {
      id: string;
      kind: 'space' | 'delete' | 'clear';
      /** The key's name, from the feature (i18n). Shown unless there is an icon. */
      label: string;
      /** Decorative icon shown instead of the label. */
      icon?: ReactNode;
      span?: number;
    };

/** The text after pressing `key`: typing appends, delete removes the last character, clear empties. */
export function applyKey(text: string, key: KeyboardKey): string {
  switch (key.kind) {
    case 'character':
      return text + key.value;
    case 'space':
      // Never a leading space or two in a row: they search for nothing new
      return text === '' || text.endsWith(' ') ? text : `${text} `;
    case 'delete':
      // By code point, so a character outside the basic plane goes whole
      return Array.from(text).slice(0, -1).join('');
    case 'clear':
      return '';
  }
}

/**
 * Letters a–z and digits 0–9, six columns, then space (3 columns), delete and clear (2). The
 * characters are not translated; the action keys' names come from the feature.
 */
export function alphanumericKeys(actions: {
  space: { label: string; icon?: ReactNode };
  delete: { label: string; icon?: ReactNode };
  clear: { label: string; icon?: ReactNode };
}): KeyboardKey[] {
  const characters = 'abcdefghijklmnopqrstuvwxyz1234567890'
    .split('')
    .map((value): KeyboardKey => ({ id: value, kind: 'character', value }));
  return [
    ...characters,
    { id: 'space', kind: 'space', span: 3, ...actions.space },
    { id: 'delete', kind: 'delete', span: 1, ...actions.delete },
    { id: 'clear', kind: 'clear', span: 2, ...actions.clear },
  ];
}
