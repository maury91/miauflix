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
          "A passive circle with a person's or profile's picture. Until the picture loads, when there is none and when it fails, the fallback shows: the name's first letter on a colour (a profile colour, set inline), or custom content. Sizes are 2, 2.5, 4 and 8rem, or `fill` to cover a square tile frame. Named by `name` (`role=\"img\"`), or `decorative` when the name is shown next to it.",
      },
    },
  },
  args: { name: 'Maria' },
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
      <StateCell name="Sizes, picture">
        <div style={row}>
          {(['sm', 'md', 'lg', 'xl'] as const).map(size => (
            <span key={size} style={gap}>
              <Avatar name="Maria" src={picture} size={size} />
            </span>
          ))}
        </div>
      </StateCell>
      <StateCell name="Letter fallback on a profile colour">
        <div style={row}>
          {(['sm', 'md', 'lg', 'xl'] as const).map(size => (
            <span key={size} style={gap}>
              <Avatar name="Élodie" size={size} color="#6d4aa8" />
            </span>
          ))}
        </div>
      </StateCell>
      <StateCell name="Failed picture, custom fallback">
        <div style={row}>
          <span style={gap}>
            <Avatar name="Guest" src="/missing-avatar.png" size="lg" />
          </span>
          <Avatar name="Kids" size="lg" color="#3d6b5c" fallback={<CatIcon />} />
        </div>
      </StateCell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const guest = canvas.getByRole('img', { name: 'Guest' });
    await waitFor(() => expect(guest).toHaveAttribute('data-status', 'failed'));
    await expect(guest).toHaveTextContent('G');
    await expect(guest.querySelector('img')).toBeNull();
    await waitFor(() =>
      expect(canvas.getAllByRole('img', { name: 'Maria' })[0]).toHaveAttribute(
        'data-status',
        'loaded'
      )
    );
    await expect(canvas.getAllByRole('img', { name: 'Élodie' })[0]).toHaveTextContent('É');
  },
};
