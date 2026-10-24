import {
  useGetListQuery,
  useGetListsInfiniteQuery,
  usePromoteListMediaMutation,
} from '@features/media/api/lists.api';
import {
  useGetMovieQuery,
  useGetSeasonQuery,
  useGetShowQuery,
} from '@features/media/api/media.api';
import {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
} from '@features/notifications/api/notifications.api';
import { configureStore } from '@reduxjs/toolkit';
import { artworkSlice } from '@store/slices/artwork';
import { authSlice } from '@store/slices/auth';
import { homeNavigationSlice } from '@store/slices/homeNavigation';
import { measurementActions, measurementsSlice } from '@store/slices/measurements';
import { realtimeSlice } from '@store/slices/realtime';
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
  args: { route: { type: 'home' } },
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => {
      const store = configureStore({
        reducer: {
          auth: authSlice.reducer,
          artwork: artworkSlice.reducer,
          homeNavigation: homeNavigationSlice.reducer,
          measurements: measurementsSlice.reducer,
          realtime: realtimeSlice.reducer,
        },
      });
      store.dispatch(
        measurementActions.windowSizeChanged({
          width: window.innerWidth,
          height: window.innerHeight,
        })
      );
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
  const getLists = mocked(useGetListsInfiniteQuery);
  const getList = mocked(useGetListQuery);
  const promote = mocked(usePromoteListMediaMutation);
  const getMovie = mocked(useGetMovieQuery);
  const getSeason = mocked(useGetSeasonQuery);
  const getShow = mocked(useGetShowQuery);
  const getNotifications = mocked(useGetNotificationsQuery);
  const markNotificationRead = mocked(useMarkNotificationReadMutation);

  getLists.mockReturnValue({
    data: {
      pages: [
        {
          page: 0,
          pageSize: 20,
          totalPages: 1,
          results: [...homeCategories.slice(0, 1), ...popularCategories],
        },
      ],
      pageParams: [0],
    },
    fetchNextPage: fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    isError: false,
  } as never);
  getList.mockImplementation(query => {
    if (typeof query !== 'object' || query === null) return emptyQuery;
    return (listResponses[(query as { category: string }).category] ?? emptyQuery) as never;
  });
  promote.mockReturnValue([fn()] as never);
  getMovie.mockReturnValue(emptyQuery);
  getSeason.mockReturnValue(emptyQuery);
  getShow.mockReturnValue(emptyQuery);
  getNotifications.mockReturnValue({
    data: { notifications: [], unreadCount: 0 },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: fn(),
  } as never);
  markNotificationRead.mockReturnValue([fn(), { isLoading: false }] as never);
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
