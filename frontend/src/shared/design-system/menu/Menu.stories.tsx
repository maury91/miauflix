import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../button/Button';
import { IconButton } from '../icon-button/IconButton';
import { SurfaceStage } from '../storyHelpers';
import { space } from '../tokens';
import { useStoryVirtualFocus } from '../useStoryVirtualFocus';
import { Menu } from './Menu';
import type { MenuEntry } from './menuItems';

import SwitchIcon from '~icons/mdi/account-switch-outline';
import MoreIcon from '~icons/mdi/dots-vertical';
import HelpIcon from '~icons/mdi/help-circle-outline';
import LogoutIcon from '~icons/mdi/logout';
import EditIcon from '~icons/mdi/pencil-outline';

const meta = {
  title: 'Design System/Collections/Menu',
  tags: ['autodocs'],
  component: Menu,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'An action menu next to its trigger, which the feature renders with the props Menu gives it (`aria-haspopup`, `aria-expanded`, the ref focus returns to). While open it contains focus: Up/Down move the white active item, skipping disabled ones and clamping at the ends; Left/Right stay inside; Confirm runs the item and closes; Back or a press outside closes it. Items are actions or links (`href`), with separators. Submenus are not implemented until a feature needs one.',
      },
    },
  },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <div style={{ minHeight: '20rem' }}>
          <Story />
        </div>
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof Menu>;

const items: MenuEntry[] = [
  { id: 'edit', label: 'Edit profile', icon: <EditIcon /> },
  { id: 'switch', label: 'Switch profile', icon: <SwitchIcon /> },
  { id: 'manage', label: 'Manage profiles', disabled: true },
  { type: 'separator', id: 'separator' },
  { id: 'help', label: 'Help', icon: <HelpIcon />, href: '#help' },
  { id: 'sign-out', label: 'Sign out', icon: <LogoutIcon /> },
];
const names: Record<string, string> = Object.fromEntries(
  items.flatMap(entry => ('label' in entry ? [[entry.id, entry.label]] : []))
);

function ProfileActions() {
  const [last, setLast] = useState('');
  const { containerRef, focus, isFocused } = useStoryVirtualFocus([['more', 'play']]);
  return (
    <div ref={containerRef} style={{ display: 'flex', alignItems: 'flex-start' }}>
      <Menu
        label="Profile actions"
        items={items}
        onAction={id => setLast(names[id])}
        trigger={props => (
          <IconButton
            {...props}
            label="Profile actions"
            icon={<MoreIcon />}
            focused={isFocused('more')}
            onMouseMove={() => focus('more')}
          />
        )}
      />
      <span style={{ marginLeft: space.md }}>
        <Button focused={isFocused('play')} onMouseMove={() => focus('play')}>
          Play
        </Button>
      </span>
      <p style={{ marginLeft: space.lg, color: '#a6adaf' }}>Last action: {last}</p>
    </div>
  );
}

/**
 * Confirm on the trigger opens the menu with its first item active. Down skips the disabled item,
 * Confirm runs the active one and closes; Back closes without acting.
 */
export const ProfileMenu: Story = {
  render: () => <ProfileActions />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Profile actions' });
    await userEvent.keyboard('{Enter}');
    const menu = canvas.getByRole('menu', { name: 'Profile actions' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toHaveFocus();
    await expect(canvas.getByRole('menuitem', { name: 'Edit profile' })).toHaveAttribute(
      'data-active'
    );

    // Clamped at the end, skipping the disabled item; Left/Right stay inside
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}');
    await expect(canvas.getByRole('menuitem', { name: 'Sign out' })).toHaveAttribute('data-active');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    await expect(canvas.getByRole('menuitem', { name: 'Switch profile' })).toHaveAttribute(
      'data-active'
    );
    await userEvent.keyboard('{Enter}');
    await expect(canvas.queryByRole('menu')).toBeNull();
    await expect(canvas.getByText('Last action: Switch profile')).toBeInTheDocument();
    await expect(trigger).toHaveFocus();

    await userEvent.keyboard('{Enter}{Escape}');
    await expect(canvas.queryByRole('menu')).toBeNull();
    await expect(canvas.getByText('Last action: Switch profile')).toBeInTheDocument();
  },
};

/** Near the end of the screen the menu lines up with the trigger's end edge, and can open above. */
export const AlignedEnd: Story = {
  render: () => (
    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '14rem' }}>
      <Menu
        label="More"
        items={items}
        align="end"
        placement="top"
        onAction={() => undefined}
        trigger={props => <IconButton {...props} label="More" icon={<MoreIcon />} />}
      />
    </div>
  ),
};
