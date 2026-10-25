import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';

import { homeFixtureAssets } from '../../../pages/home/home.assets';
import { PosterCard } from './PosterCard';

const artwork = homeFixtureAssets[687163];
const meta = {
  title: 'UI Elements/PosterCard',
  component: PosterCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Portrait 2:3 poster card used by search results. Title and a metadata line sit under the artwork; focus draws a 3 px white outline around the poster. Without a poster the title is centered on a dark tile.',
      },
    },
  },
  args: {
    poster: artwork.poster,
    title: 'Astra: The Last Question',
    meta: '2021 • 2h 35m • ★ 8.0',
    width: '200px',
    focused: false,
    onClick: fn(),
  },
} satisfies Meta<typeof PosterCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Focused: Story = { args: { focused: true } };
export const WithoutPoster: Story = { args: { poster: '' } };
export const Activates: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Astra: The Last Question' }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
