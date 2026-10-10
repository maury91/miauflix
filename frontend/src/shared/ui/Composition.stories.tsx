import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { ActionRow } from './action-row/ActionRow';
import { Alert } from './alert/Alert';
import { Button } from './button/Button';
import { FieldLabel, Input, Select } from './form-controls/FormControls';
import { Switch } from './switch/Switch';

const meta = {
  title: 'Miauflix UI/Composition',
  parameters: {
    layout: 'centered',
    docs: { canvas: { className: 'miauflix-composition-canvas' } },
    backgrounds: { options: { black: { name: 'Black', value: '#000000' } } },
  },
  globals: { backgrounds: { value: 'black' } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function SettingsExample() {
  const [sync, setSync] = useState(true);
  const [saved, setSaved] = useState(false);
  return (
    <form
      style={{ width: 'min(360px, 85vw)', display: 'grid', gap: 12 }}
      onSubmit={event => {
        event.preventDefault();
        setSaved(true);
      }}
    >
      <div>
        <FieldLabel htmlFor="profile-name">Profile name</FieldLabel>
        <Input id="profile-name" required defaultValue="Miau" aria-describedby="profile-help" />
        <p id="profile-help">Shown in your account.</p>
      </div>
      <div>
        <FieldLabel htmlFor="playback-quality">Playback quality</FieldLabel>
        <Select id="playback-quality" defaultValue="auto">
          <option value="auto">Automatic</option>
          <option value="1080">1080p</option>
        </Select>
      </div>
      <div>
        <FieldLabel htmlFor="episode-sync">Episode syncing</FieldLabel>
        <Switch id="episode-sync" checked={sync} onCheckedChange={setSync} />
      </div>
      <ActionRow density="compact">
        <Button appearance="settings" size="medium" type="submit">
          Save
        </Button>
        <Button
          appearance="settings"
          size="medium"
          color="secondary"
          onClick={() => setSaved(false)}
        >
          Dismiss result
        </Button>
      </ActionRow>
      {saved && <Alert severity="success">Example settings saved locally.</Alert>}
    </form>
  );
}
export const SettingsForm: Story = {
  render: () => <SettingsExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('Example settings saved locally.');
  },
};
export const ResponsiveActions: Story = {
  render: () => (
    <div style={{ width: 'min(480px, 85vw)' }}>
      <ActionRow density="compact">
        <Button appearance="settings" size="medium">
          Save configuration
        </Button>
        <Button appearance="settings" size="medium" color="secondary">
          Cancel
        </Button>
      </ActionRow>
    </div>
  ),
};
