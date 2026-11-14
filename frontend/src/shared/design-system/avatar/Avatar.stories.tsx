import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';

import { StateCell, SurfaceStage } from '../storyHelpers';
import { storyImage } from '../storyImage';
import { Avatar } from './Avatar';

import CatIcon from '~icons/mdi/cat';

const meta = {
  title: 'Design System/Collections/Avatar',
  tags: ['autodocs'],
  component: Avatar,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A passive circle with a person\'s or profile\'s picture; an avatar is always a picture, never initials. Until the picture has loaded (and if it fails) the circle keeps its size and shows its colour (a profile colour, set inline) and an optional decorative placeholder. Sizes are 2, 2.5, 4 and 8rem, or `fill` to cover a square tile frame. Named by `name` (`role="img"`), or `decorative` when the name is shown next to it.',
      },
    },
  },
  args: { name: 'Maria', src: storyImage('#f4d58d', '#e07a5f') },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof Avatar>;

const picture = storyImage('#f4d58d', '#e07a5f');
const row = { display: 'flex', alignItems: 'center' } as const;
const gap = { marginRight: '1rem', display: 'inline-flex' };

export const States: Story = {
  render: () => (
    <div>
      <StateCell name="Sizes">
        <div style={row}>
          {(['sm', 'md', 'lg', 'xl'] as const).map(size => (
            <span key={size} style={gap}>
              <Avatar name="Maria" src={picture} size={size} />
            </span>
          ))}
        </div>
      </StateCell>
      <StateCell name="Picture failed: colour, and colour with placeholder">
        <div style={row}>
          <span style={gap}>
            <Avatar name="Guest" src="/missing-avatar.png" size="lg" color="#6d4aa8" />
          </span>
          <Avatar
            name="Kids"
            src="/missing-avatar-2.png"
            size="lg"
            color="#3d6b5c"
            placeholder={<CatIcon style={{ fontSize: '2rem', color: '#f5f5f5' }} />}
          />
        </div>
      </StateCell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const guest = canvas.getByRole('img', { name: 'Guest' });
    await waitFor(() => expect(guest).toHaveAttribute('data-status', 'failed'));
    await expect(guest.querySelector('img')).toBeNull();
    await expect(guest).toHaveTextContent('');
    await waitFor(() =>
      expect(canvas.getAllByRole('img', { name: 'Maria' })[0]).toHaveAttribute(
        'data-status',
        'loaded'
      )
    );
  },
};
