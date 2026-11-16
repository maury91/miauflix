import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsPage from './SettingsPage';

beforeEach(() => {
  // jsdom lays nothing out; the navigation layer only focuses elements on screen
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderSettings = (props: Partial<Parameters<typeof SettingsPage>[0]> = {}) => {
  const handlers = {
    onConfiguration: vi.fn(),
    onStorage: vi.fn(),
    onSources: vi.fn(),
    onDismiss: vi.fn(),
  };
  render(<SettingsPage canConfigure canManageStorage canManageSources {...handlers} {...props} />);
  return handlers;
};

const press = (key: string) =>
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key });
  });

describe('settings keyboard navigation', () => {
  it('moves through the areas with Up and Down and reaches Back on the rail with Left', () => {
    renderSettings();
    const configuration = screen.getByRole('button', { name: 'Configuration' });
    const storage = screen.getByRole('button', { name: 'Storage' });
    const sources = screen.getByRole('button', { name: 'Sources' });
    expect(configuration).toHaveFocus();
    expect(configuration.closest('[data-focused]')).not.toBeNull();

    press('ArrowDown');
    expect(storage).toHaveFocus();
    press('ArrowDown');
    expect(sources).toHaveFocus();
    // The list's end holds focus
    press('ArrowDown');
    expect(sources).toHaveFocus();
    press('ArrowUp');
    expect(storage).toHaveFocus();

    press('ArrowLeft');
    expect(screen.getByRole('button', { name: 'Back to Home' })).toHaveFocus();
    press('ArrowRight');
    expect(storage).toHaveFocus();
  });

  it('opens an area with Confirm and leaves with Back', () => {
    const { onStorage, onDismiss } = renderSettings({ initialFocus: 'storage' });
    expect(screen.getByRole('button', { name: 'Storage' })).toHaveFocus();
    press('Enter');
    expect(onStorage).toHaveBeenCalledOnce();
    press('Escape');
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('starts on Back when no area can be opened', () => {
    renderSettings({ canConfigure: false, canManageStorage: false, canManageSources: false });
    expect(screen.getByRole('button', { name: 'Configuration' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back to Home' })).toHaveFocus();
    expect(screen.getByText(/available to administrators/)).toBeInTheDocument();
  });
});
