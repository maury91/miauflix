import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Button } from '../button/Button';
import { Inline } from '../layout/Inline';
import { Stack } from '../layout/Stack';
import { SurfaceStage } from '../storyHelpers';
import { Heading, Text } from '../text/Text';
import { Surface } from './Surface';

const meta = {
  title: 'Design System/Foundations/Surface',
  tags: ['autodocs'],
  component: Surface,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A passive container from the surface ladder: `surface` or `raised`, an optional `borderSubtle` hairline, a radius and padding from the tokens. It never acts (no click handling, never a focus target) and it is solid, so actions inside take the solid look even over artwork. Passive cards are a Surface plus layout; there is no generic Card.',
      },
    },
  },
  decorators: [
    Story => (
      <SurfaceStage surface="overMedia">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof Surface>;

export default meta;
type Story = StoryObj<typeof Surface>;

/** Over artwork: the actions inside take the solid look. */
export const LevelsOverArtwork: Story = {
  render: () => (
    <Inline gap="lg" align="start">
      <Surface padding="lg" radius="lg">
        <Stack gap="sm">
          <Heading level={3}>Surface</Heading>
          <Text tone="secondary">Cards and panels.</Text>
          <Button>Solid action</Button>
        </Stack>
      </Surface>
      <Surface level="raised" border padding="lg" radius="lg">
        <Stack gap="sm">
          <Heading level={3}>Raised, with a hairline</Heading>
          <Text tone="secondary">A panel over another surface.</Text>
        </Stack>
      </Surface>
    </Inline>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Solid action' })).toHaveAttribute(
      'data-surface',
      'solid'
    );
  },
};
