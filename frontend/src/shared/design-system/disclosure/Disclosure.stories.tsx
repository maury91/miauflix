import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../button/Button';
import { Switch } from '../choice/Switch';
import { Stack } from '../layout/Stack';
import { InitialFocus, NavigationStage, SurfaceStage } from '../storyHelpers';
import { Disclosure } from './Disclosure';

const meta = {
  title: 'Design System/Controls/Disclosure',
  tags: ['autodocs'],
  component: Disclosure,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A section header that shows or hides its content: a button inside a heading with `aria-expanded`, controlling a region it names. Confirm or a press toggles; arrows never do, every direction exits. The content is mounted only while expanded, so its controls join the enclosing group then. The header is a row, so virtual focus is the white outline. Actions (siblings, never nested) sit beside it. Several in a column compose an accordion.',
      },
    },
  },
  args: { title: 'Advanced', children: null },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <div style={{ maxWidth: '32rem' }}>
          <Story />
        </div>
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof Disclosure>;

export default meta;
type Story = StoryObj<typeof Disclosure>;

function Settings() {
  const [hardware, setHardware] = useState(true);
  return (
    <NavigationStage>
      <Stack gap="xs">
        <Disclosure
          navId="playback"
          title="Playback"
          description="Decoding and buffering"
          actions={<Button navId="reset">Reset</Button>}
        >
          <Switch
            navId="hardware"
            label="Hardware decoding"
            checked={hardware}
            onCheckedChange={setHardware}
          />
        </Disclosure>
        <Disclosure navId="subtitles" title="Subtitles" defaultExpanded>
          <Button navId="style">Caption style</Button>
        </Disclosure>
      </Stack>
      <InitialFocus id="playback" />
    </NavigationStage>
  );
}

/** Confirm opens it and its content joins the column; Down then reaches it. */
export const Accordion: Story = {
  render: () => <Settings />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const playback = canvas.getByRole('button', { name: 'Playback' });
    await expect(playback).toHaveAttribute('aria-expanded', 'false');
    await expect(playback).toHaveAccessibleDescription('Decoding and buffering');
    await expect(canvas.queryByRole('switch', { name: 'Hardware decoding' })).toBeNull();
    // Arrows never toggle
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}');
    await expect(playback).toHaveAttribute('aria-expanded', 'false');
    await userEvent.keyboard('{Enter}');
    await expect(playback).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByRole('region', { name: 'Playback' })).toBeVisible();
    // Right reaches the header's action; Down from the header reaches the content
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('button', { name: 'Reset' })).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowLeft}{ArrowDown}');
    await expect(
      canvas.getByRole('switch', { name: 'Hardware decoding' }).closest('label')
    ).toHaveAttribute('data-focused');
  },
};
