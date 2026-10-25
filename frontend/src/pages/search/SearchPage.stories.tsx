import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import { initialSearchState, searchSlice, type SearchState } from '@store/slices/search';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { expect, fn } from 'storybook/test';

import { searchStateFixture } from './search.fixtures';
import SearchPage from './SearchPage';

const withSearchState = (search: SearchState) => (Story: () => React.ReactElement) => {
  const store = configureStore({
    reducer: { auth: authSlice.reducer, search: searchSlice.reducer },
    preloadedState: { search },
  });
  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
};

const meta = {
  title: 'Search/Search Page',
  component: SearchPage,
  args: { onDismiss: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SearchPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Results for a query, with the recent searches the backend returned. */
export const Results: Story = {
  decorators: [withSearchState(searchStateFixture)],
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Results for “Dune”' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'A' })).toHaveFocus();
  },
};

/** First visit: nothing typed and no recent searches yet. */
export const Empty: Story = {
  decorators: [withSearchState(initialSearchState)],
};

export const Searching: Story = {
  decorators: [
    withSearchState({ ...initialSearchState, query: 'Dune', status: 'loading', requestId: 1 }),
  ],
};

export const NoResults: Story = {
  decorators: [
    withSearchState({ ...initialSearchState, query: 'zzzz', status: 'ready', requestId: 1 }),
  ],
};
