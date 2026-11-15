import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Stack } from '../layout/Stack';
import { InitialFocus, NavigationStage, SurfaceStage } from '../storyHelpers';
import { Text } from '../text/Text';
import { Link } from './Link';

const meta = {
  title: 'Design System/Controls/Link',
  tags: ['autodocs'],
  component: Link,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A native anchor: the browser activates it, opens it in a new tab and offers its context menu. Always underlined, in the link colour (white over artwork). `inline` inherits the running text; `standalone` sits on its own line in the label role. Links cannot invert, so virtual focus is the white outline. Every direction exits; Confirm follows it once. An action without a destination is a Button.',
      },
    },
  },
  args: { href: '#', children: 'Link' },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof Link>;

export default meta;
type Story = StoryObj<typeof Link>;

export const Variants: Story = {
  render: () => (
    <Stack gap="md">
      <Text>
        Read the <Link href="#privacy">privacy notice</Link> before you connect a service.
      </Text>
      <Link href="#help" variant="standalone">
        How pairing works
      </Link>
      <Link href="#focused" variant="standalone" focused>
        Focused
      </Link>
      <Link href="https://trakt.tv" variant="standalone" external>
        Trakt (opens in a new tab)
      </Link>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const external = canvas.getByRole('link', { name: /Trakt/ });
    await expect(external).toHaveAttribute('target', '_blank');
    await expect(external).toHaveAttribute('rel', 'noopener noreferrer');
  },
};

/** Under the navigation layer: keys and the pointer move focus between links. */
export const Navigation: Story = {
  render: () => (
    <NavigationStage>
      <Stack gap="md">
        <Link href="#one" variant="standalone" navId="one">
          Account
        </Link>
        <Link href="#two" variant="standalone" navId="two">
          Devices
        </Link>
      </Stack>
      <InitialFocus id="one" />
    </NavigationStage>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Account' })).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('link', { name: 'Devices' })).toHaveAttribute('data-focused');
    await expect(canvas.getByRole('link', { name: 'Account' })).not.toHaveAttribute('data-focused');
  },
};
