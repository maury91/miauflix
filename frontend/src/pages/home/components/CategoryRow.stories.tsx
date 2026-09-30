import { useGetListQuery, usePromoteListMediaMutation } from '@features/media/api/lists.api';
import { skipToken } from '@reduxjs/toolkit/query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, mocked } from 'storybook/test';

import { homeCategories, mediaForCategory, mediaForCategoryBySlug } from '../home.fixtures';
import { CategoryRow } from './CategoryRow';

const meta = {
  title: 'Home/Category Row',
  component: CategoryRow,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div
        style={{
          width: '100%',
          maxWidth: 1280,
          margin: '0 auto',
          padding: '32px 0',
          boxSizing: 'border-box',
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CategoryRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const category = homeCategories[0];

function setupListMock(state: 'loaded' | 'loading' | 'error' | 'empty' | 'dormant') {
  const getList = mocked(useGetListQuery);
  const promote = mocked(usePromoteListMediaMutation);
  const promoteSpy = fn();

  promote.mockReturnValue([promoteSpy] as never);
  getList.mockImplementation(query => {
    if (query === skipToken || state === 'dormant') {
      return {
        data: undefined,
        currentData: undefined,
        isLoading: false,
        isFetching: false,
        isError: false,
      } as never;
    }
    if (state === 'loading') {
      return {
        data: undefined,
        currentData: undefined,
        isLoading: true,
        isFetching: true,
        isError: false,
      } as never;
    }
    if (state === 'error') {
      return {
        data: undefined,
        currentData: undefined,
        isLoading: false,
        isFetching: false,
        isError: true,
      } as never;
    }
    const results = state === 'empty' ? [] : (mediaForCategoryBySlug[category.slug] ?? []);
    const response = { page: 0, pageSize: 20, total: results.length, results };
    return {
      data: response,
      currentData: response,
      isLoading: false,
      isFetching: false,
      isError: false,
    } as never;
  });

  void promoteSpy;
}

const baseArgs = {
  category,
  categoryIndex: 0,
  initialIndex: 0,
  mediaWidth: 250,
  mediaPerPage: 3,
  gap: 18,
  peekWidth: 75,
  active: true,
  loadIntent: 'visible' as const,
  visible: true,
  onActive: fn(),
  onSelect: fn(),
};

export const Loaded: Story = {
  args: baseArgs,
  beforeEach: () => setupListMock('loaded'),
  play: async ({ args, canvas, userEvent }) => {
    const selectedMedia = mediaForCategory['popular-movies'][1];
    const secondCard = canvas.getByRole('button', { name: selectedMedia.title });
    await userEvent.hover(secondCard);
    await expect(secondCard).toHaveAttribute('aria-current', 'true');
    await userEvent.click(secondCard);
    await expect(args.onSelect).toHaveBeenCalledWith(selectedMedia);
  },
};

export const LoadedVisual: Story = {
  args: baseArgs,
  beforeEach: () => setupListMock('loaded'),
};

export const ArrowSequenceVisual: Story = {
  args: {
    ...baseArgs,
    mediaWidth: 253.44,
    mediaPerPage: 4,
    gap: 14.4,
    peekWidth: 111.52,
  },
  beforeEach: () => setupListMock('loaded'),
};

export const LoadedHoverVisual: Story = {
  args: baseArgs,
  beforeEach: () => setupListMock('loaded'),
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByRole('region'));
  },
};

export const Loading: Story = {
  args: baseArgs,
  beforeEach: () => setupListMock('loading'),
};

export const Error: Story = {
  args: baseArgs,
  beforeEach: () => setupListMock('error'),
};

export const Empty: Story = {
  args: baseArgs,
  beforeEach: () => setupListMock('empty'),
};

export const Dormant: Story = {
  args: { ...baseArgs, active: false, loadIntent: 'dormant', visible: false },
  beforeEach: () => setupListMock('dormant'),
};
