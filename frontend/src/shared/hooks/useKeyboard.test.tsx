import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(getKeyboardAction(key({ key: 'MediaPlayPause' }))).toBe('playPause');
    expect(getKeyboardAction(key({ key: 'MediaPlay' }))).toBe('play');
    expect(getKeyboardAction(key({ key: 'MediaPause' }))).toBe('pause');
    for (const [code, action] of [
      [10252, 'playPause'],
      [415, 'play'],
      [19, 'pause'],
    ] as const) {
      const tizenMedia = key({ key: 'Unidentified' });
      Object.defineProperty(tizenMedia, 'keyCode', { value: code });
      expect(getKeyboardAction(tizenMedia)).toBe(action);
    }
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

function LostFocusFixture({
  scoped,
  showSelected = true,
  selectedDisabled = false,
}: {
  scoped?: KeyboardOptions;
  showSelected?: boolean;
  selectedDisabled?: boolean;
}) {
  const scopeRef = useKeyboardNavigation(scoped);
  return (
    <main ref={scopeRef}>
      <button type="button">First</button>
      <button type="button" data-default-focus>
        Default
      </button>
      {showSelected && (
        <button type="button" disabled={selectedDisabled}>
          Selected
        </button>
      )}
    </main>
  );
}

describe('restoring lost focus', () => {
  beforeEach(() => {
    // jsdom lays nothing out; every element counts as on screen.
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('puts focus back on the last focused element, and only that, when a direction finds none', () => {
    const onDown = vi.fn(() => true);
    render(<LostFocusFixture scoped={{ onDown }} />);
    const selected = screen.getByRole('button', { name: 'Selected' });
    selected.focus();
    selected.blur();
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document.body, { key: 'ArrowDown' });

    expect(selected).toHaveFocus();
    expect(onDown).not.toHaveBeenCalled();
    fireEvent.keyDown(selected, { key: 'ArrowDown' });
    expect(onDown).toHaveBeenCalledOnce();
  });

  it("restores the scope's default item once the last focused element is gone", () => {
    const { rerender } = render(<LostFocusFixture />);
    screen.getByRole('button', { name: 'Selected' }).focus();
    rerender(<LostFocusFixture showSelected={false} />);

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });

    expect(screen.getByRole('button', { name: 'Default' })).toHaveFocus();
  });

  it('lets the page choose its default item, also when the last one was disabled', () => {
    const onRestoreFocus = vi.fn(() => {
      screen.getByRole('button', { name: 'First' }).focus();
      return true;
    });
    const { rerender } = render(<LostFocusFixture scoped={{ onRestoreFocus }} />);
    const selected = screen.getByRole('button', { name: 'Selected' });
    selected.focus();
    rerender(<LostFocusFixture scoped={{ onRestoreFocus }} selectedDisabled />);
    // Browsers move focus off a control that gets disabled; jsdom keeps it there.
    vi.spyOn(document, 'activeElement', 'get').mockReturnValueOnce(document.body);

    fireEvent.keyDown(document.body, { key: 'ArrowUp' });

    expect(onRestoreFocus).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('leaves confirm and back to the page while nothing is focused', () => {
    const onConfirm = vi.fn(() => true);
    render(<Fixture page={{ onConfirm }} />);

    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(document.body);
  });
});
