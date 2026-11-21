import type { ProviderView } from '@miauflix/backend';
import { FocusScope, NavigationProvider } from '@shared/navigation';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProviderSettingsForm } from './ProviderSettingsForm';

const update = vi.hoisted(() => vi.fn());
vi.mock('@features/sources/api/sources.api', () => ({
  useUpdateProviderMutation: () => [update, { isLoading: false }],
}));

afterEach(() => {
  cleanup();
  update.mockReset();
});

const provider = {
  id: 'private-tracker',
  name: 'Private tracker',
  settings: { username: 'cat' },
  settingsSchema: [
    { name: 'username', type: 'text', label: 'Username' },
    { name: 'password', type: 'password', label: 'Password' },
    { name: 'freeleech', type: 'checkbox', label: 'Freeleech only' },
  ],
} as unknown as ProviderView;

const focusedField = (label: string) =>
  screen.getByLabelText(label).closest('[data-focused]') !== null;

describe('ProviderSettingsForm', () => {
  it('edits credentials with the shared fields and saves them', async () => {
    update.mockReturnValue({ unwrap: () => Promise.resolve() });
    const onSaved = vi.fn();
    render(<ProviderSettingsForm provider={provider} onSaved={onSaved} />);

    expect(screen.getByLabelText('Username')).toHaveValue('cat');
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.change(password, { target: { value: 'secret' } });
    // The reveal toggle keeps the value
    fireEvent.click(screen.getByRole('button', { name: 'Show Password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('secret');
    fireEvent.click(screen.getByRole('switch', { name: 'Freeleech only' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        id: 'private-tracker',
        settings: { username: 'cat', password: 'secret', freeleech: true },
      })
    );
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith('Saved settings for Private tracker.')
    );
  });

  it('takes the remote to its first field, and follows a tap into another one', () => {
    // jsdom lays nothing out: give every element a box, so the navigation layer can focus it
    const rects = vi
      .spyOn(Element.prototype, 'getClientRects')
      .mockImplementation(() => [{}] as unknown as DOMRectList);
    try {
      render(
        <NavigationProvider>
          <FocusScope>
            <ProviderSettingsForm provider={provider} onSaved={vi.fn()} />
          </FocusScope>
        </NavigationProvider>
      );
      expect(focusedField('Username')).toBe(true);
      act(() => screen.getByRole('switch', { name: 'Freeleech only' }).focus());
      expect(focusedField('Username')).toBe(false);
      expect(focusedField('Freeleech only')).toBe(true);
    } finally {
      rects.mockRestore();
    }
  });
});
