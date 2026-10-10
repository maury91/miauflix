import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Switch } from './Switch';

const meta = {
  title: 'Miauflix UI/Components/Switch',
  component: Switch,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Use Switch for a boolean setting, never navigation or submission. The feature owns checked and onCheckedChange. Label the setting rather than the action ("Episode syncing", not "Turn on"). It is a native button with role=switch, Space/Enter activation and aria-checked. Keep the label stable as the value changes; show enabled/disabled text alongside it if useful.',
      },
    },
  },
  args: { checked: false, onCheckedChange: fn(), 'aria-label': 'Episode syncing' },
} satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Off: Story = {};
export const On: Story = { args: { checked: true } };
export const Disabled: Story = { args: { disabled: true } };
export const Invalid: Story = { args: { invalid: true } };
function ControlledSwitch() {
  const [checked, setChecked] = useState(false);
  return <Switch aria-label="Episode syncing" checked={checked} onCheckedChange={setChecked} />;
}
export const Interactive: Story = {
  render: () => <ControlledSwitch />,
  play: async ({ canvasElement }) => {
    const control = within(canvasElement).getByRole('switch');
    await userEvent.click(control);
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard(' ');
    await expect(control).toHaveAttribute('aria-checked', 'false');
  },
};
