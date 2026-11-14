import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button/Button';
import { Message } from '../message/Message';
import { SurfaceStage } from '../storyHelpers';
import { EmptyState } from './EmptyState';

import DownloadIcon from '~icons/mdi/download-off-outline';
import SearchIcon from '~icons/mdi/movie-search-outline';
import ServerIcon from '~icons/mdi/server-off';

const meta = {
  title: 'Design System/Feedback/EmptyState',
  tags: ['autodocs'],
  component: EmptyState,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Absent content, centred: a visual, a heading, a short body, actions (primary first, where focus lands) and an optional Message when the absence comes from a problem. A layout, not an error primitive; it is never a focus target itself.',
      },
    },
  },
  args: {
    heading: 'Nothing downloaded yet',
    children: 'Titles you download for offline viewing show up here.',
  },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyCollection: Story = {
  args: {
    visual: <DownloadIcon />,
    actions: <Button focused>Browse titles</Button>,
  },
};

export const NoResults: Story = {
  args: {
    visual: <SearchIcon />,
    heading: 'No results for “dnue”',
    children: 'Check the spelling or search by actor, director or year.',
    actions: (
      <>
        <Button focused>Search “dune” instead</Button>
        <Button>Clear search</Button>
      </>
    ),
  },
};

export const FromAProblem: Story = {
  args: {
    visual: <ServerIcon />,
    heading: 'No sources to show',
    children: 'Sources appear once the server answers.',
    message: (
      <Message tone="danger" variant="banner" title="Could not reach the server">
        It did not answer within 10 seconds.
      </Message>
    ),
    actions: <Button focused>Try again</Button>,
  },
};
