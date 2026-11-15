import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../button/Button';
import { NavigationStage, SurfaceStage } from '../storyHelpers';
import { IconButtonGroup, type IconButtonGroupItem } from './IconButtonGroup';

import DownloadIcon from '~icons/mdi/download-outline';
import TrailerIcon from '~icons/mdi/movie-open-outline';
import PlayIcon from '~icons/mdi/play';
import PlusIcon from '~icons/mdi/plus';
import ThumbUpIcon from '~icons/mdi/thumb-up';
import ThumbUpOutlineIcon from '~icons/mdi/thumb-up-outline';

const meta = {
  title: 'Design System/Controls/IconButtonGroup',
  tags: ['autodocs'],
  component: IconButtonGroup,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "IconButtons sharing one description slot instead of individual tooltips (style guide 8.3 B). The slot sits at a fixed place, shows the focused button's description, changes in place as focus moves and is empty when focus leaves the group. Its height is always reserved and the text never wraps, so neither focus changes nor longer translations move the buttons. It is not a focus target and not a live region.",
      },
    },
  },
  args: {
    label: 'Title actions',
    items: [],
  },
} satisfies Meta<typeof IconButtonGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

function DetailsActions() {
  const [liked, setLiked] = useState(false);
  const items: IconButtonGroupItem[] = [
    { id: 'trailer', label: 'Trailer', icon: <TrailerIcon />, description: 'Watch the trailer' },
    { id: 'list', label: 'My list', icon: <PlusIcon />, description: 'Add to my list' },
    {
      id: 'like',
      label: 'Like',
      icon: liked ? <ThumbUpIcon /> : <ThumbUpOutlineIcon />,
      pressed: liked,
      description: liked ? 'Rated: I like this' : 'I like this',
      onClick: () => setLiked(value => !value),
    },
    { id: 'download', label: 'Download', icon: <DownloadIcon />, disabled: true },
  ];
  return (
    <NavigationStage layout="horizontal">
      <SurfaceStage surface="overMedia">
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <Button navId="play" size="lg" icon={<PlayIcon />}>
            Watch now
          </Button>
          <span style={{ width: '1rem' }} />
          <IconButtonGroup label="Title actions" size="lg" items={items} navId="actions" />
        </div>
      </SurfaceStage>
    </NavigationStage>
  );
}

/**
 * The details action row: Watch now, then a group whose description sits below it. The disabled
 * Download is skipped by navigation, so Right from Like stays there.
 */
export const DetailsRow: Story = {
  render: () => <DetailsActions />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const slot = canvas.getByRole('group', { name: 'Title actions' }).nextElementSibling!;
    const like = canvas.getByRole('button', { name: 'Like' });
    const start = like.getBoundingClientRect();
    await expect(slot).toHaveTextContent('');
    const slotHeight = slot.getBoundingClientRect().height;
    await expect(slotHeight).toBeGreaterThan(0);

    await userEvent.keyboard('{ArrowRight}');
    await expect(slot).toHaveTextContent('Watch the trailer');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expect(slot).toHaveTextContent('I like this');
    await expect(like).toHaveAccessibleDescription('I like this');
    await userEvent.keyboard('{Enter}');
    await expect(slot).toHaveTextContent('Rated: I like this');
    await userEvent.keyboard('{ArrowRight}');
    await expect(like).toHaveAttribute('data-focused');

    // Leaving the group empties the slot; nothing moved
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    await expect(slot).toHaveTextContent('');
    await expect(like.getBoundingClientRect()).toEqual(start);
    await expect(slot.getBoundingClientRect().height).toBe(slotHeight);
  },
};

export const DescriptionAbove: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <IconButtonGroup
        label="Player options"
        descriptionPlacement="above"
        focusedId="like"
        items={[
          { id: 'list', label: 'My list', icon: <PlusIcon /> },
          { id: 'like', label: 'Like', icon: <ThumbUpOutlineIcon />, description: 'I like this' },
          { id: 'download', label: 'Download', icon: <DownloadIcon /> },
        ]}
      />
    </SurfaceStage>
  ),
};

function SingleButton() {
  const [focused, setFocused] = useState<string | undefined>(undefined);
  return (
    <SurfaceStage surface="solid">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 8rem' }}>
        <IconButtonGroup
          label="Episode options"
          focusedId={focused}
          onPointerFocus={setFocused}
          items={[
            {
              id: 'download',
              label: 'Download',
              icon: <DownloadIcon />,
              description: 'Download every episode of this season to watch offline',
            },
          ]}
        />
      </div>
    </SurfaceStage>
  );
}

/**
 * A description much wider than the group: it is centred and runs past both ends, while the
 * group keeps its width and the button never moves.
 */
export const LongDescription: Story = {
  render: () => <SingleButton />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Download' });
    const group = canvas.getByRole('group', { name: 'Episode options' })
      .parentElement as HTMLElement;
    const before = { button: button.getBoundingClientRect(), group: group.getBoundingClientRect() };
    await userEvent.hover(button);
    const text = await canvas.findByText('Download every episode of this season to watch offline');
    await expect(button.getBoundingClientRect()).toEqual(before.button);
    await expect(group.getBoundingClientRect().width).toBe(before.group.width);
    // Centred on the group
    const textBox = text.getBoundingClientRect();
    const groupBox = group.getBoundingClientRect();
    await expect(
      Math.abs(textBox.left + textBox.width / 2 - (groupBox.left + groupBox.width / 2))
    ).toBeLessThan(1);
  },
};
