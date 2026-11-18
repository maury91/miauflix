import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

beforeEach(() => {
  // jsdom lays nothing out; the navigation layer only focuses elements on screen
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList
  );
});

const press = (key: string) =>
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key });
  });

const focused = () => document.querySelector('[data-focused]');

describe('ProfileEditorPage', () => {
  it('starts on the name and moves through the form with the remote', () => {
    const { onCancel } = setupTest(admin);
    expect(screen.getByLabelText('Profile name').closest('[data-focused]')).not.toBeNull();
    press('ArrowDown');
    expect(focused()).toHaveAttribute('role', 'tab');
    expect(focused()).toHaveAccessibleName('Color & fabric');
    // Down enters the shown panel at the chosen colour
    press('ArrowDown');
    expect(focused()).toHaveAttribute('role', 'radio');
    expect(focused()).toHaveAttribute('aria-checked', 'true');
    // Back leaves the page
    press('Escape');
    expect(onCancel).toHaveBeenCalled();
  });

  it('leaves with the remote’s Back from the name it opens on, and after editing it', async () => {
    const { onCancel } = setupTest(admin);
    // The name holds no DOM focus outside edit mode: the page keeps it, so its keys arrive
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(screen.getByRole('main'));
    const remoteBack = () =>
      act(() => {
        fireEvent.keyDown(document.activeElement ?? document.body, {
          key: 'Unidentified',
          keyCode: 10009,
        });
      });
    // Editing the name, Back ends editing first
    const name = screen.getByLabelText('Profile name');
    act(() => name.focus());
    remoteBack();
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(screen.getByRole('main'));
    remoteBack();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('chooses a part with Confirm, never by moving onto it', () => {
    setupTest(admin);
    press('ArrowDown');
    press('ArrowDown');
    const chosen = focused()!;
    press('ArrowRight');
    expect(chosen).toHaveAttribute('aria-checked', 'true');
    const next = focused()!;
    expect(next).not.toBe(chosen);
    press('Enter');
    expect(next).toHaveAttribute('aria-checked', 'true');
    expect(chosen).toHaveAttribute('aria-checked', 'false');
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

  it('moves on with the TV keyboard’s Done without submitting the form', () => {
    setupTest(null);
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-enough' } });
    const done = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 65376 });
    screen.getByLabelText('Email').dispatchEvent(done);
    expect(done.defaultPrevented).toBe(true);
    expect(mocks.createProfile).not.toHaveBeenCalled();
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
    const rail = screen.getByRole('navigation', { name: 'Profile' });
    fireEvent.click(within(rail).getByRole('button', { name: 'Back' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
