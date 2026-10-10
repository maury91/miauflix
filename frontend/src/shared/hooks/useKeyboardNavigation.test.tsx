import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useKeyboardNavigation } from './useKeyboardNavigation';

function Fixture({
  parent,
  child,
  childEnabled = true,
}: {
  parent: (event: KeyboardEvent) => boolean;
  child: (event: KeyboardEvent) => boolean;
  childEnabled?: boolean;
}) {
  const parentRef = useKeyboardNavigation({ onRight: parent });
  const childRef = useKeyboardNavigation({ enabled: childEnabled, onRight: child });

  return (
    <main ref={parentRef} data-testid="parent">
      <button ref={childRef} type="button">
        Child
      </button>
      <input aria-label="Text" />
    </main>
  );
}

describe('useKeyboardNavigation', () => {
  it('dispatches to the deepest scope and falls back when it returns false', () => {
    const parent = vi.fn(() => true);
    const child = vi.fn(() => false);
    render(<Fixture parent={parent} child={child} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Child' }), { key: 'ArrowRight' });

    expect(child).toHaveBeenCalledTimes(1);
    expect(parent).toHaveBeenCalledTimes(1);
  });

  it('stops at the first scope that consumes the action', () => {
    const parent = vi.fn(() => true);
    const child = vi.fn(() => true);
    render(<Fixture parent={parent} child={child} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Child' }), { key: 'ArrowRight' });

    expect(child).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
  });

  it('leaves native editing keys alone', () => {
    const parent = vi.fn(() => true);
    const child = vi.fn(() => true);
    render(<Fixture parent={parent} child={child} />);

    fireEvent.keyDown(screen.getByLabelText('Text'), { key: 'ArrowRight' });

    expect(child).not.toHaveBeenCalled();
    expect(parent).not.toHaveBeenCalled();
  });
});
