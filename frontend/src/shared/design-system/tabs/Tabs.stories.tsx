import { FocusGroup } from '@shared/navigation/NavigationProvider';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../button/Button';
import { NavigationStage, StateCell, SurfaceStage } from '../storyHelpers';
import { color, fontFamily, space, typeScale } from '../tokens';
import { TabPanel, Tabs } from './Tabs';

import AccountIcon from '~icons/mdi/account-outline';
import PaletteIcon from '~icons/mdi/palette-outline';
import ShieldIcon from '~icons/mdi/shield-outline';

const meta = {
  title: 'Design System/Navigation/Tabs',
  tags: ['autodocs'],
  component: Tabs,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Tabs are pill actions with inverted fill: the selected tab is translucent, the focused one white. They never wrap. Selection is manual: moving focus across tabs never changes the panel, Confirm (or a press) does, so a TV remote held on Right never loads every panel. Horizontal: Left/Right move between tabs, Down enters the selected panel. Vertical mirrors the axis. Each tab controls its panel, and the panel is labelled by its tab.',
      },
    },
  },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof Tabs>;

const noop = () => undefined;
const items = [
  { id: 'profile', label: 'Profile', icon: <AccountIcon /> },
  { id: 'appearance', label: 'Appearance', icon: <PaletteIcon /> },
  { id: 'privacy', label: 'Privacy', icon: <ShieldIcon /> },
] as const;
const textItems = items.map(({ id, label }) => ({ id, label }));

const panelText = {
  margin: `${space.md} 0`,
  color: color.textSecondary,
  fontFamily,
  fontSize: typeScale.body.fontSize,
  lineHeight: typeScale.body.lineHeight,
};

/** Selected is current state (translucent), focus is the white fill; a tab can be both. */
export const States: Story = {
  render: () => (
    <div>
      <StateCell name="Text, focus on another tab">
        <Tabs
          id="states-text"
          label="Profile sections"
          items={textItems}
          selectedId="profile"
          focusedId="appearance"
          onSelect={noop}
        />
      </StateCell>
      <StateCell name="Icon and text, focus on the selected tab">
        <Tabs
          id="states-icon"
          label="Profile sections"
          items={items}
          selectedId="profile"
          focusedId="profile"
          onSelect={noop}
        />
      </StateCell>
      <StateCell name="Disabled tab">
        <Tabs
          id="states-disabled"
          label="Profile sections"
          items={[textItems[0], textItems[1], { ...textItems[2], disabled: true }]}
          selectedId="profile"
          onSelect={noop}
        />
      </StateCell>
      <StateCell name="Vertical">
        <div style={{ width: '14rem' }}>
          <Tabs
            id="states-vertical"
            label="Profile sections"
            orientation="vertical"
            items={items}
            selectedId="appearance"
            focusedId="privacy"
            onSelect={noop}
          />
        </div>
      </StateCell>
    </div>
  ),
};

const panels = {
  profile: { text: 'Name and avatar.', actions: ['Rename', 'Change avatar'] },
  appearance: { text: 'Colours and layout.', actions: ['Reset theme'] },
  privacy: { text: 'Watch history and syncing.', actions: ['Pause history', 'Clear history'] },
};
type Section = keyof typeof panels;

function ProfileEditor() {
  const [selected, setSelected] = useState<Section>('profile');

  return (
    <NavigationStage>
      <Tabs
        id="editor"
        navId="tabs"
        label="Profile sections"
        items={items}
        selectedId={selected}
        onSelect={setSelected}
      />
      {items.map(item => (
        <TabPanel key={item.id} tabsId="editor" tab={item.id} selected={item.id === selected}>
          <p style={panelText}>{panels[item.id].text}</p>
          {/* Hidden panels' actions are skipped */}
          <FocusGroup id={`panel:${item.id}`} layout="horizontal">
            <div style={{ display: 'flex' }}>
              {panels[item.id].actions.map(action => (
                <span key={action} style={{ marginRight: space.xs }}>
                  <Button navId={`panel:${action}`}>{action}</Button>
                </span>
              ))}
            </div>
          </FocusGroup>
        </TabPanel>
      ))}
    </NavigationStage>
  );
}

/**
 * Right moves focus to Appearance without changing the panel; Confirm selects it. Down enters the
 * selected panel, Up comes back to the tabs.
 */
export const ManualActivation: Story = {
  render: () => <ProfileEditor />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tab = (name: string) => canvas.getByRole('tab', { name });

    await expect(tab('Profile')).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowRight}');
    await expect(tab('Appearance')).toHaveAttribute('data-focused');
    // Focus alone never selects
    await expect(tab('Profile')).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('tabpanel')).toHaveAccessibleName('Profile');

    await userEvent.keyboard('{Enter}');
    await expect(tab('Appearance')).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('tabpanel')).toHaveAccessibleName('Appearance');
    await expect(tab('Appearance')).toHaveAttribute(
      'aria-controls',
      canvas.getByRole('tabpanel').id
    );

    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('button', { name: 'Reset theme' })).toHaveAttribute(
      'data-focused'
    );
  },
};
