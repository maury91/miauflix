import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SettingsPage from './SettingsPage';

afterEach(cleanup);
describe('settings keyboard navigation', () => {
  it('moves backward with Up and forward with Down, wrapping enabled actions', () => {
    render(
      <SettingsPage
        canConfigure
        canManageStorage
        onConfiguration={vi.fn()}
        onStorage={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    const configuration = screen.getByRole('button', { name: 'Configuration' });
    const storage = screen.getByRole('button', { name: 'Storage' });
    expect(document.activeElement).toBe(configuration);
    fireEvent.keyDown(configuration, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(storage);
    fireEvent.keyDown(storage, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(configuration);
    fireEvent.keyDown(configuration, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to Home' }));
  });
});
