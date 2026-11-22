import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePageBack } from './usePageBack';

function Fixture() {
  const back = usePageBack(undefined);
  return (
    <main data-testid="page" {...back}>
      <input aria-label="Search" />
    </main>
  );
}

/**
 * A click or native Tab blurs the page, runs microtasks while the body is active, then focuses the
 * new element. jsdom's programmatic focus() never yields in between, so the order is replayed here.
 */
async function nativeFocusChange(from: HTMLElement, to: HTMLElement | null) {
  const activeElement = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
  await act(async () => {
    from.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: to }));
    await Promise.resolve();
  });
  activeElement.mockRestore();
  if (to) act(() => to.focus());
  else act(() => from.blur());
}

describe('usePageBack', () => {
  it('lets a click move focus into a field', async () => {
    render(<Fixture />);
    const page = screen.getByTestId('page');
    const input = screen.getByLabelText('Search');
    // The page takes focus on mount
    await act(async () => {});
    expect(document.activeElement).toBe(page);
    // In a browser, focusing the page here cancels the click's pending focus on the field
    const refocus = vi.spyOn(page, 'focus');

    await nativeFocusChange(page, input);

    expect(refocus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it('takes focus back when it is lost to the body', async () => {
    render(<Fixture />);
    const page = screen.getByTestId('page');
    const input = screen.getByLabelText('Search');
    act(() => input.focus());

    await nativeFocusChange(input, null);

    expect(document.activeElement).toBe(page);
  });
});
