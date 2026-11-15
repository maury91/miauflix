import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Inline } from '../layout/Inline';
import { Stack } from '../layout/Stack';
import { StateCell, SurfaceStage } from '../storyHelpers';
import { KeyHint } from './KeyHint';

const meta = {
  title: 'Design System/Overlays/KeyHint',
  tags: ['autodocs'],
  component: KeyHint,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "A key cap and what it does, for keyboard and remote legends; group several with Inline. Never focusable and never the only way to learn an action. Keys are named by what they do (`confirm`, `back`, `arrows`, a colour button); the glyph follows the platform (the remote's keys on TV, the keyboard's on the web), so nothing in the cap needs translating. `keyLabel` names the key for assistive technology.",
      },
    },
  },
  args: { keys: 'confirm', label: 'Select' },
} satisfies Meta<typeof KeyHint>;

export default meta;
type Story = StoryObj<typeof meta>;

function Legend({ device }: { device: 'remote' | 'keyboard' }) {
  return (
    <Inline gap="lg" rowGap="sm">
      <KeyHint keys="arrows" label="Move" device={device} />
      <KeyHint
        keys="confirm"
        label="Select"
        keyLabel={device === 'remote' ? 'OK' : 'Enter'}
        device={device}
      />
      <KeyHint keys="back" label="Back" device={device} />
      <KeyHint keys={['left', 'right']} label="Seek" device={device} />
      <KeyHint keys="playPause" label="Play or pause" device={device} />
    </Inline>
  );
}

export const Legends: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <Stack gap="lg">
        <StateCell name="Keyboard (web)">
          <Legend device="keyboard" />
        </StateCell>
        <StateCell name="Remote (TV)">
          <Legend device="remote" />
        </StateCell>
        <StateCell name="Remote colour buttons">
          <Inline gap="lg">
            <KeyHint keys="red" label="Delete" keyLabel="Red button" device="remote" />
            <KeyHint keys="green" label="Rename" device="remote" />
            <KeyHint keys="yellow" label="Sort" device="remote" />
            <KeyHint keys="blue" label="Filter" device="remote" />
          </Inline>
        </StateCell>
      </Stack>
    </SurfaceStage>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Select')).toHaveLength(2);
    await expect(canvasElement.querySelector('[tabindex], button, a')).toBeNull();
  },
};

/** Over artwork the caps take a dark fill and the labels turn white. */
export const OverMedia: Story = {
  render: () => (
    <SurfaceStage surface="overMedia">
      <Legend device="remote" />
    </SurfaceStage>
  ),
};
