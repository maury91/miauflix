import { configureStore } from '@reduxjs/toolkit';
import { authSlice, type SessionInfo } from '@store/slices/auth';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { expect, fn, waitFor } from 'storybook/test';

import { profilesFixture } from './profiles.fixtures';
import WhosWatchingPage from './WhosWatchingPage';

const withProfiles = (sessions: SessionInfo[]) => (Story: () => React.ReactElement) => {
  const store = configureStore({
    reducer: { auth: authSlice.reducer },
    preloadedState: {
      auth: { currentSessionId: null, currentUser: null, availableSessions: sessions },
    },
  });
  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
};

const meta = {
  title: 'Profiles/Who’s Watching',
  component: WhosWatchingPage,
  args: {
    onSelect: fn(),
    onEdit: fn(),
    onAdd: fn(),
    onManage: fn(),
    onDone: fn(),
    onBack: fn(),
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof WhosWatchingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An admin is signed in, so profiles can be added. */
export const WithAdmin: Story = {
  decorators: [withProfiles(profilesFixture)],
  play: async ({ canvas }) => {
    // The page fades in.
    await waitFor(() =>
      expect(canvas.getByRole('heading', { name: 'Who’s watching?' })).toBeVisible()
    );
    await expect(canvas.getByRole('button', { name: 'Maurizio' })).toHaveFocus();
    await expect(canvas.getByRole('button', { name: 'Add profile' })).toBeInTheDocument();
  },
};

/** Without an admin profile on the device there is no Add profile. */
export const WithoutAdmin: Story = {
  decorators: [withProfiles(profilesFixture.slice(1))],
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: 'Add profile' })).toBeNull();
  },
};

export const Manage: Story = {
  args: { mode: 'manage' },
  decorators: [withProfiles(profilesFixture)],
};
