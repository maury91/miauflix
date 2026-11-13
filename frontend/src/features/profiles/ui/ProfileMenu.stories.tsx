import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';

import { ProfileMenu } from './ProfileMenu';

import { profilesFixture } from '@/__test-utils__/fixtures/profiles.fixtures';

const meta = {
  title: 'Home/Profile Menu',
  component: ProfileMenu,
  args: {
    profile: profilesFixture[0],
    focused: true,
    railExpanded: true,
    onSwitch: fn(),
    onEdit: fn(),
    onLogout: fn(),
    onExit: fn(),
    onPointerEnter: fn(),
    onPointerLeave: fn(),
  },
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
} satisfies Meta<typeof ProfileMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The keyboard moved into the panel: it lands on Switch profile. */
export const Focused: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Switch profile' })).toHaveFocus();
  },
};

/** Highlighted from the rail, with the keyboard still on the rail. */
export const Highlighted: Story = { args: { focused: false } };
