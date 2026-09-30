import {
  useGetListQuery,
  useGetListsQuery,
  useGetPopularListsInfiniteQuery,
  usePromoteListMediaMutation,
} from '@features/media/api/lists.api';
import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { expect, fn, mocked } from 'storybook/test';

import {
  homeCategories,
  mediaForCategory,
  mediaForCategoryBySlug,
  popularCategories,
} from './home.fixtures';
import HomePage from './HomePage';

const meta = {
  title: 'Home/Home Page',
  component: HomePage,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => {
      const store = configureStore({ reducer: { auth: authSlice.reducer } });
      return (
        <Provider store={store}>
          <Story />
        </Provider>
      );
    },
  ],
} satisfies Meta<typeof HomePage>;

export default meta;
type Story = StoryObj<typeof meta>;

const emptyQuery = {
  data: undefined,
  currentData: undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
} as never;

const listResponses = Object.fromEntries(
  homeCategories.map(category => {
    const results = mediaForCategoryBySlug[category.slug] ?? [];
    const response = { page: 0, pageSize: 20, total: results.length, results };
    return [
      category.slug,
      {
        data: response,
        currentData: response,
        isLoading: false,
        isFetching: false,
        isError: false,
      },
    ];
  })
);

function setupHomeMocks() {
  const getLists = mocked(useGetListsQuery);
  const getPopular = mocked(useGetPopularListsInfiniteQuery);
  const getList = mocked(useGetListQuery);
  const promote = mocked(usePromoteListMediaMutation);

  getLists.mockReturnValue({
    data: homeCategories.slice(0, 1),
    isLoading: false,
    isError: false,
  } as never);
  getPopular.mockReturnValue({
    data: {
      pages: [{ page: 0, pageSize: 20, totalPages: 1, results: popularCategories }],
      pageParams: [0],
    },
    fetchNextPage: fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  } as never);
  getList.mockImplementation(query => {
    if (typeof query !== 'object' || query === null) return emptyQuery;
    return (listResponses[(query as { category: string }).category] ?? emptyQuery) as never;
  });
  promote.mockReturnValue([fn()] as never);
}

export const Browse: Story = {
  beforeEach: setupHomeMocks,
  play: async ({ canvas, userEvent }) => {
    const first = canvas.getByRole('button', { name: mediaForCategory['popular-movies'][0].title });
    const nextRowCard = canvas.getByRole('button', {
      name: mediaForCategory['trending-movies'][0].title,
    });
    await expect(first).toHaveAttribute('aria-current', 'true');
    await first.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(nextRowCard).toHaveAttribute('aria-current', 'true');
    await userEvent.keyboard('{ArrowRight}');
    await expect(
      canvas.getByRole('button', { name: mediaForCategory['trending-movies'][1].title })
    ).toHaveAttribute('aria-current', 'true');
  },
};

export const BrowseVisual: Story = {
  beforeEach: setupHomeMocks,
};
