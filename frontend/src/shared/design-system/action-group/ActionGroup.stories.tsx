import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Button } from '../button/Button';
import { IconButton } from '../icon-button/IconButton';
import { Stack } from '../layout/Stack';
import { StateCell, SurfaceStage } from '../storyHelpers';
import { color, fontFamily, typeScale } from '../tokens';
import { ActionGroup } from './ActionGroup';

import DownloadIcon from '~icons/mdi/download';
import PlayIcon from '~icons/mdi/play';
import PlusIcon from '~icons/mdi/plus';
import ShareIcon from '~icons/mdi/share-variant';

const meta = {
  title: 'Design System/Layout/ActionGroup',
  tags: ['autodocs'],
  component: ActionGroup,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A set of actions, primary first, with spacing, alignment and wrapping owned here: the visual, DOM and focus order are the same, and the navigation layer lands on the first. `row` wraps when there is no room, `column` stacks them full width, `auto` stacks them on compact windows only. The divider above is opt-in, never a border on every row of buttons. Each action keeps its own look.',
      },
    },
  },
  args: { children: null },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof ActionGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

const actions = (
  <>
    <Button icon={<PlayIcon />}>Play</Button>
    <Button icon={<DownloadIcon />}>Download</Button>
    <Button icon={<PlusIcon />}>My list</Button>
  </>
);
const cell = { width: '22rem' };

export const Alignments: Story = {
  render: () => (
    <>
      <StateCell name="start">
        <div style={cell}>
          <ActionGroup>{actions}</ActionGroup>
        </div>
      </StateCell>
      <StateCell name="center">
        <div style={cell}>
          <ActionGroup align="center">
            <Button>Retry</Button>
            <Button>Back</Button>
          </ActionGroup>
        </div>
      </StateCell>
      <StateCell name="end">
        <div style={cell}>
          <ActionGroup align="end">
            <Button>Save</Button>
            <Button>Cancel</Button>
          </ActionGroup>
        </div>
      </StateCell>
    </>
  ),
};

/** Narrow on purpose: the row wraps, spaced the same between lines and actions. */
export const Wrapping: Story = {
  render: () => (
    <div style={{ width: '16rem' }} data-testid="narrow">
      <ActionGroup>{actions}</ActionGroup>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const play = canvas.getByRole('button', { name: 'Play' }).getBoundingClientRect();
    const download = canvas.getByRole('button', { name: 'Download' }).getBoundingClientRect();
    const list = canvas.getByRole('button', { name: 'My list' }).getBoundingClientRect();
    const area = canvas.getByTestId('narrow').getBoundingClientRect();
    // Starts at the container's edge, 12px (sm) between actions, wraps onto a second line
    await expect(Math.round(play.left)).toBe(Math.round(area.left));
    await expect(Math.round(download.left - play.right)).toBe(12);
    await expect(list.top).toBeGreaterThan(play.bottom);
  },
};

export const Layouts: Story = {
  render: () => (
    <>
      <StateCell name="column">
        <div style={cell}>
          <ActionGroup layout="column">
            <Button>Delete profile and its history</Button>
            <Button>Keep profile</Button>
          </ActionGroup>
        </div>
      </StateCell>
      <StateCell name="auto: a column on compact windows">
        <div style={cell}>
          <ActionGroup layout="auto">
            <Button>Continue</Button>
            <Button>Back</Button>
          </ActionGroup>
        </div>
      </StateCell>
      <StateCell name="icon buttons, one line">
        <ActionGroup wrap={false} label="Share">
          <IconButton label="Share" icon={<ShareIcon />} />
          <IconButton label="Download" icon={<DownloadIcon />} />
          <IconButton label="Add to my list" icon={<PlusIcon />} />
        </ActionGroup>
      </StateCell>
    </>
  ),
};

/** The divider is opt-in: it separates a form's actions from the fields they act on. */
export const WithDivider: Story = {
  render: () => (
    <div style={{ maxWidth: '28rem' }}>
      <Stack gap="lg">
        <p style={{ margin: 0, color: color.textSecondary, fontFamily, ...typeScale.body }}>
          Changes apply to every device signed in to this profile.
        </p>
        <ActionGroup divider align="end">
          <Button>Save</Button>
          <Button>Cancel</Button>
        </ActionGroup>
      </Stack>
    </div>
  ),
};
