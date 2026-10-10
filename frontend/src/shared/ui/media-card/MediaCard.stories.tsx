import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';

import { homeFixtureAssets } from '../../../pages/home/home.assets';
import { MediaCard } from './MediaCard';

const artwork = homeFixtureAssets[687163];
const meta = {
  title: 'UI Elements/MediaCard',
  component: MediaCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Independent 16:9 artwork card. Backdrop → optional gradient → centered transparent logo → optional episode label → playback progress → focus outline. Default size 320 × 180 px, radius 6 px, row gap 20 px. Logos retain their proportions within 80% width and 65% height. A native button supplies keyboard activation and disabled behavior; no shared Button styling is inherited.',
      },
    },
  },
  args: {
    backdrop: artwork.backdrop,
    logo: artwork.logo,
    title: 'Astra: The Last Question',
    onClick: fn(),
    width: 320,
    focused: false,
    hovered: false,
    disabled: false,
    overlay: true,
  },
  argTypes: {
    progress: { control: { type: 'range', min: 0, max: 100, step: 1 } },
  },
} satisfies Meta<typeof MediaCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Hovered: Story = { args: { hovered: true } };
export const Focused: Story = { args: { focused: true } };
export const WithProgress: Story = { args: { progress: 40 } };
export const Episode: Story = { args: { subtitle: 'S2 E6', progress: 65 } };
export const TextFallback: Story = { args: { logo: null, title: 'The Last Meadow' } };
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas, args, userEvent }) => {
    const card = canvas.getByRole('button', { name: args.title });
    await expect(card).toBeDisabled();
    await userEvent.click(card);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
export const WithoutOverlay: Story = { args: { overlay: false } };

export const KeyboardActivation: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const card = canvas.getByRole('button', { name: args.title });
    card.focus();
    await expect(card).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await expect(args.onClick).toHaveBeenCalledTimes(2);
    await expect(canvas.queryByText(args.title)).not.toBeInTheDocument();
  },
};

export const Styleguide: Story = {
  parameters: { layout: 'fullscreen' },
  render: args => {
    const examples = [
      { ...homeFixtureAssets[687163], title: 'Astra: The Last Question' },
      { ...homeFixtureAssets[1084242], title: 'The Serpent in Bellweather' },
      { ...homeFixtureAssets[1339713], title: 'Wishwood' },
    ];
    const states = [
      { label: 'Default', props: {} },
      { label: 'Hover (mouse)', props: { hovered: true } },
      { label: 'Focus (TV / keyboard)', props: { focused: true } },
      { label: 'With progress', props: { progress: 40 } },
      { label: 'Episode information', props: { subtitle: 'S2 E6', progress: 65 } },
      { label: 'Text fallback', props: { logo: null, title: 'The Last Meadow' } },
      { label: 'Disabled', props: { disabled: true } },
    ];
    return (
      <div
        style={{
          padding: 32,
          background: '#080e12',
          color: '#fff',
          fontFamily: 'Poppins, sans-serif',
        }}
      >
        <h1>Media Card</h1>
        <p>Separate backdrop and transparent logo assets, composed in a 16:9 frame.</p>
        <h2>Logo proportions</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          {examples.map(example => (
            <MediaCard key={example.title} {...args} {...example} />
          ))}
        </div>
        <h2>Interaction states and variants</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          {states.map(({ label, props }) => (
            <div key={label}>
              <MediaCard {...args} {...props} />
              <p>{label}</p>
            </div>
          ))}
        </div>
        <h2>Dimensions and design tokens</h2>
        <p>320 × 180 px · 16:9 · 6 px radius · 20 px gap</p>
        <p>Logo: centered · max-width 80% · max-height 65% · contain · original proportions</p>
        <p>Hover: #FFFFFF40 outline · scale 1.015. Focus: 3 px #FFFFFF outline · scale 1.03.</p>
        <p>
          Progress: 4 px · inset 8 px from sides, 6 px from bottom · #E50920 fill · #FFFFFF40 track.
          Transition: 150 ms ease-out.
        </p>
        <p>
          Focus scales the complete composition. Reduced motion disables scaling and transitions.
        </p>
      </div>
    );
  },
};
