import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { fn } from 'storybook/test';

import ProfileEditorPage from './ProfileEditorPage';

import { profilesFixture } from '@/__test-utils__/fixtures/profiles.fixtures';

const withProfiles = (Story: () => React.ReactElement) => {
  const store = configureStore({
    reducer: { auth: authSlice.reducer },
    preloadedState: {
      auth: { currentSessionId: null, currentUser: null, availableSessions: profilesFixture },
    },
  });
  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
};

const meta = {
  title: 'Profiles/Profile Editor',
  component: ProfileEditorPage,
  args: { onDone: fn(), onCancel: fn() },
  decorators: [withProfiles],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ProfileEditorPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Editing the mockup's profile. */
export const Edit: Story = { args: { profile: profilesFixture[0] } };

/** Adding a profile: a suggested Plushie, an empty name, and the account's credentials. */
export const Create: Story = { args: { profile: null } };
