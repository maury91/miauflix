import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProfileEditorPage from './ProfileEditorPage';

const mocks = vi.hoisted(() => ({
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  snapshot: vi.fn(),
}));

vi.mock('@features/profiles/avatar/PlushieLive', () => ({ PlushieLive: () => null }));
vi.mock('@features/profiles/avatar/snapshot', () => ({ renderPlushieSnapshot: mocks.snapshot }));
vi.mock('@features/profiles/avatar/runtime', () => ({
  liveAvatarsSupported: () => false,
  loadPlushies: () => new Promise(() => undefined),
}));
vi.mock('@features/profiles/api/profiles.api', async importOriginal => ({
  ...(await importOriginal<object>()),
  useCreateProfileMutation: () => [mocks.createProfile, { isLoading: false }],
  useUpdateProfileMutation: () => [mocks.updateProfile, { isLoading: false }],
}));

const admin = {
  session: 'admin-session',
  user: {
    id: 'user-1',
    email: 'maurizio@example.com',
    displayName: 'Maurizio',
    role: 'admin' as const,
    avatar: { kind: 'pill', color: '#a65ce8', fabric: 'shaggy', hat: 'cowboy' },
    avatarVersion: 1,
  },
};

const setupTest = (profile: typeof admin | null) => {
  const store = configureStore({
    reducer: { auth: authSlice.reducer },
    preloadedState: {
      auth: { currentSessionId: null, currentUser: null, availableSessions: [admin] },
    },
  });
  const handlers = { onDone: vi.fn(), onCancel: vi.fn() };
  render(
    <Provider store={store}>
      <ProfileEditorPage profile={profile} {...handlers} />
    </Provider>
  );
  return handlers;
};

const image = new Blob(['png'], { type: 'image/png' });

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.snapshot.mockResolvedValue(image);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** jsdom has no layout: stack the remote's stops in one column, in document order. */
const stackNavStops = () => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const stops = [...document.querySelectorAll('[data-profile-nav]')];
    const index = stops.indexOf(this);
    const top = index < 0 ? 0 : index * 60;
    const height = index < 0 ? 0 : 50;
    return { left: 0, top, width: 200, height, right: 200, bottom: top + height } as DOMRect;
  });
};

describe('ProfileEditorPage', () => {
  it('lets the remote move out of the name field', () => {
    stackNavStops();
    setupTest(admin);
    const name = screen.getByLabelText('Profile name');
    name.focus();
    // A caret in the middle keeps Left for the field; Down always leaves
    (name as HTMLInputElement).setSelectionRange(2, 2);
    fireEvent.keyDown(name, { key: 'ArrowLeft' });
    expect(name).toHaveFocus();
    fireEvent.keyDown(name, { key: 'ArrowDown' });
    expect(name).not.toHaveFocus();
    expect(document.activeElement).toHaveAttribute('role', 'tab');
  });

  it('edits the name and look, then saves them with a fresh picture', async () => {
    mocks.updateProfile.mockResolvedValue({ data: { ...admin.user, displayName: 'Mau' } });
    const { onDone } = setupTest(admin);

    expect(screen.getByRole('heading', { name: 'Edit profile' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Mau' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith('user-1'));
    expect(mocks.updateProfile).toHaveBeenCalledWith({
      session: 'admin-session',
      displayName: 'Mau',
      avatar: expect.objectContaining({
        kind: 'pill',
        color: '#3fb8ad',
        fabric: 'shaggy',
        hat: 'cowboy',
      }),
      image,
    });
  });

  it('saves once while the picture is still being drawn', async () => {
    let drawn: (picture: Blob) => void = () => undefined;
    mocks.snapshot.mockImplementation(() => new Promise<Blob>(resolve => (drawn = resolve)));
    mocks.updateProfile.mockResolvedValue({ data: admin.user });
    const { onDone } = setupTest(admin);

    const save = screen.getByRole('button', { name: 'Save changes' });
    fireEvent.click(save);
    fireEvent.submit(save.closest('form')!);
    await waitFor(() => expect(save).toBeDisabled());
    drawn(image);

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(mocks.snapshot).toHaveBeenCalledTimes(1);
    expect(mocks.updateProfile).toHaveBeenCalledTimes(1);
  });

  it('switches tabs between the parts of the Plushie', () => {
    setupTest(admin);
    fireEvent.click(screen.getByRole('tab', { name: 'Accessories' }));
    expect(screen.getByRole('radio', { name: 'Cowboy' })).toHaveAttribute('aria-checked', 'true');
  });

  it('creates a profile with an email and password through the admin session', async () => {
    mocks.createProfile.mockResolvedValue({
      data: { session: 'new-session', user: { ...admin.user, id: 'user-9', role: 'user' } },
    });
    const { onDone } = setupTest(null);

    expect(screen.getByRole('heading', { name: 'Add profile' })).toBeInTheDocument();
    expect(screen.getByLabelText('Profile name')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
    expect(await screen.findByText(/at least 8 characters/)).toBeInTheDocument();
    expect(mocks.createProfile).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-enough' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('user-9'));
    expect(mocks.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        adminSession: 'admin-session',
        email: 'sam@example.com',
        password: 'long-enough',
        displayName: 'Sam',
        image,
      })
    );
  });

  it('shows the server’s reason when saving fails', async () => {
    mocks.createProfile.mockResolvedValue({
      error: { status: 409, data: 'An account with this email already exists' },
    });
    setupTest(null);
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-enough' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
    expect(
      await screen.findByText('An account with this email already exists')
    ).toBeInTheDocument();
  });

  it('leaves with the rail’s Back button and offers no way to delete the profile', () => {
    const { onCancel } = setupTest(admin);
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    const rail = screen.getByRole('complementary', { name: 'Page navigation' });
    fireEvent.click(within(rail).getByRole('button', { name: 'Back' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
