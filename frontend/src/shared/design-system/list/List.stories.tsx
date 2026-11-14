import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../button/Button';
import { IconButton } from '../icon-button/IconButton';
import { SurfaceStage } from '../storyHelpers';
import { useStoryVirtualFocus } from '../useStoryVirtualFocus';
import { List } from './List';
import { ListItem } from './ListItem';
import { SettingRow } from './SettingRow';

import BellIcon from '~icons/mdi/bell-outline';
import DeleteIcon from '~icons/mdi/delete-outline';
import EditIcon from '~icons/mdi/pencil-outline';
import PlayIcon from '~icons/mdi/play-circle-outline';
import ServerIcon from '~icons/mdi/server-outline';

const meta = {
  title: 'Design System/Collections/List',
  tags: ['autodocs'],
  component: List,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "Rows share one shell. ListItem: leading visual, title and description, metadata and trailing actions; its semantics come from its props (a button with `onClick`, a link with `href`, otherwise passive), and trailing actions are siblings of the primary part, never inside it. Rows cannot invert, so virtual focus on the primary part is the outline around the row, while a focused trailing action shows its own white fill. SettingRow puts a setting's title and description at the start and its value and control at the end; a boolean setting is a Switch filling the row.",
      },
    },
  },
  args: { children: null },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <div style={{ maxWidth: '34rem' }}>
          <Story />
        </div>
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof List>;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => undefined;

/** Focus is virtual: the navigation layer passes `focused`; here it is set directly. */
export const RowStates: Story = {
  render: () => (
    <List label="Row states">
      <ListItem
        title="Home server"
        description="192.168.1.20 · reachable"
        leading={<ServerIcon />}
        metadata="12 ms"
        onClick={noop}
      />
      <ListItem
        title="Office server"
        description="Selected: the one in use"
        leading={<ServerIcon />}
        metadata="38 ms"
        selected
        onClick={noop}
      />
      <ListItem
        title="Episode 4 · The long night"
        description="A row with a focused primary part"
        leading={<PlayIcon />}
        metadata="52 min"
        focused
        onClick={noop}
      />
      <ListItem
        title="Old server"
        description="Disabled: not reachable"
        leading={<ServerIcon />}
        disabled
        onClick={noop}
      />
      <ListItem
        title="Release notes"
        description="A link row"
        leading={<BellIcon />}
        href="#release-notes"
      />
      <ListItem
        title="Passive row with actions"
        description="Only its trailing actions act; one is focused"
        trailing={
          <>
            <IconButton label="Edit" icon={<EditIcon />} focused />
            <IconButton label="Remove" icon={<DeleteIcon />} />
          </>
        }
      />
    </List>
  ),
};

export const Divided: Story = {
  render: () => (
    <List label="Notifications" divided>
      <ListItem
        title="New episode"
        description="The Expanse · S2E4 is available"
        metadata="2 h"
        onClick={noop}
      />
      <ListItem
        title="Download finished"
        description="Dune: Part Two"
        metadata="Yesterday"
        onClick={noop}
      />
      <ListItem
        title="Sync paused"
        description="Trakt needs you to sign in again"
        metadata="Mon"
        onClick={noop}
      />
    </List>
  ),
};

const servers = ['home', 'office', 'backup'] as const;
const names = { home: 'Home server', office: 'Office server', backup: 'Backup server' };

function Servers() {
  const [current, setCurrent] = useState<string>('home');
  const [removed, setRemoved] = useState<string[]>([]);
  const shown = servers.filter(id => !removed.includes(id));
  const { containerRef, focus, isFocused, focusedId } = useStoryVirtualFocus(
    shown.map(id => [id, `${id}:remove`])
  );
  return (
    <div ref={containerRef}>
      <List label="Servers">
        {shown.map(id => (
          <ListItem
            key={id}
            title={names[id]}
            description={current === id ? 'In use' : 'Available'}
            leading={<ServerIcon />}
            selected={current === id}
            focused={isFocused(id)}
            onPointerFocus={() => focus(id)}
            onClick={() => setCurrent(id)}
            trailing={
              <IconButton
                label={`Remove ${names[id]}`}
                icon={<DeleteIcon />}
                focused={isFocused(`${id}:remove`)}
                onMouseMove={() => focus(`${id}:remove`)}
                onClick={() => {
                  setRemoved(list => [...list, id]);
                  // The navigation layer restores focus to the nearest row
                  const next = shown[shown.indexOf(id) + 1] ?? shown[shown.indexOf(id) - 1];
                  if (next) focus(next);
                }}
              />
            }
          />
        ))}
      </List>
      <p style={{ color: '#a6adaf' }}>Focused: {focusedId}</p>
    </div>
  );
}

/**
 * A compound list: Up/Down move between rows, Right from a row reaches its remove action and Left
 * comes back. Confirm on a row selects the server; on the action it removes the row.
 */
export const VirtualFocus: Story = {
  render: () => <Servers />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rowOf = (name: string) =>
      canvas.getByRole('button', { name: new RegExp(`^${name}`) }).parentElement as HTMLElement;

    await expect(rowOf('Home server')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(rowOf('Office server')).toHaveAttribute('data-selected');
    await expect(canvas.getByRole('button', { name: /^Office server/ })).toHaveAttribute(
      'aria-current',
      'true'
    );

    await userEvent.keyboard('{ArrowRight}');
    const remove = canvas.getByRole('button', { name: 'Remove Office server' });
    await expect(remove).toHaveAttribute('data-focused');
    await expect(rowOf('Office server')).not.toHaveAttribute('data-focused');
    await userEvent.keyboard('{Enter}');
    await expect(canvas.queryByText('Office server')).toBeNull();
    await expect(rowOf('Backup server')).toHaveAttribute('data-focused');
  },
};

function Settings() {
  const { containerRef, focus, isFocused } = useStoryVirtualFocus([
    ['sync'],
    ['quality'],
    ['wipe'],
  ]);
  const [sync, setSync] = useState(true);
  return (
    <div ref={containerRef}>
      <List label="Playback" divided>
        <SettingRow
          title="Episode syncing"
          description="Marks episodes as watched on Trakt."
          toggle={{
            checked: sync,
            onCheckedChange: setSync,
            focused: isFocused('sync'),
            onPointerFocus: () => focus('sync'),
          }}
        />
        <SettingRow
          title="Preferred quality"
          description="Used when several sources are available."
          value="1080p"
          control={props => (
            <Button {...props} focused={isFocused('quality')} onMouseMove={() => focus('quality')}>
              Change
            </Button>
          )}
        />
        <SettingRow
          title="Clear watch history"
          description="Removes progress for every title on this profile. This cannot be undone."
          control={props => (
            <Button {...props} focused={isFocused('wipe')} onMouseMove={() => focus('wipe')}>
              Clear
            </Button>
          )}
        />
      </List>
    </div>
  );
}

/**
 * Settings rows: a toggle is a Switch filling the row; other settings put their value and control
 * at the end, named by the title and described by the description. Narrow screens wrap the
 * control below the text.
 */
export const SettingRows: Story = {
  render: () => <Settings />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sync = canvas.getByRole('switch', { name: 'Episode syncing' });
    await userEvent.keyboard('{Enter}');
    await expect(sync).toHaveAttribute('aria-checked', 'false');
    const change = canvas.getByRole('button', { name: 'Preferred quality Change' });
    await expect(change).toHaveAccessibleDescription('Used when several sources are available.');
    await userEvent.keyboard('{ArrowDown}');
    await expect(change).toHaveAttribute('data-focused');
  },
};
