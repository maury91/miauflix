import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getKeyboardAction, type KeyboardOptions, useKeyboard } from './useKeyboard';
import { useKeyboardNavigation } from './useKeyboardNavigation';

function Fixture({ page, scoped }: { page: KeyboardOptions; scoped?: KeyboardOptions }) {
  useKeyboard(page);
  const scopeRef = useKeyboardNavigation(scoped);
  return (
    <main ref={scopeRef}>
      <button type="button">Card</button>
      <input aria-label="Text" />
    </main>
  );
}

const key = (init: KeyboardEventInit & { keyCode?: number }) =>
  new KeyboardEvent('keydown', init) as KeyboardEvent & { keyCode: number };

describe('getKeyboardAction', () => {
  it('resolves key names and TV remote key codes', () => {
    expect(getKeyboardAction(key({ key: 'ArrowLeft' }))).toBe('left');
    expect(getKeyboardAction(key({ key: 'Search' }))).toBe('search');
    const tizenSearch = key({ key: 'Unidentified' });
    Object.defineProperty(tizenSearch, 'keyCode', { value: 10225 });
    expect(getKeyboardAction(tizenSearch)).toBe('search');
    const tizenBack = key({ key: 'Unidentified' });
    Object.defineProperty(tizenBack, 'keyCode', { value: 10009 });
    expect(getKeyboardAction(tizenBack)).toBe('back');
    expect(getKeyboardAction(key({ key: 'Tab' }))).toBeNull();
  });
});

describe('useKeyboard', () => {
  it('handles the remote Search key page-wide, including from a text field', () => {
    const onSearch = vi.fn(() => true);
    render(<Fixture page={{ onSearch }} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Card' }), {
      key: 'Unidentified',
      keyCode: 10225,
    });
    fireEvent.keyDown(screen.getByLabelText('Text'), { key: 'Search' });
    fireEvent.keyDown(document.body, { key: 'Search' });

    expect(onSearch).toHaveBeenCalledTimes(3);
  });

  it('runs after element scopes, which can claim the key first', () => {
    const page = vi.fn(() => true);
    const scoped = vi.fn(() => true);
    const { rerender } = render(<Fixture page={{ onRight: page }} scoped={{ onRight: scoped }} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Card' }), { key: 'ArrowRight' });
    expect(scoped).toHaveBeenCalledTimes(1);
    expect(page).not.toHaveBeenCalled();

    rerender(<Fixture page={{ onRight: page }} scoped={{ onRight: () => false }} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Card' }), { key: 'ArrowRight' });
    expect(page).toHaveBeenCalledTimes(1);
  });

  it('ignores keys while disabled', () => {
    const onSearch = vi.fn(() => true);
    render(<Fixture page={{ enabled: false, onSearch }} />);

    fireEvent.keyDown(document.body, { key: 'Search' });

    expect(onSearch).not.toHaveBeenCalled();
  });
});
