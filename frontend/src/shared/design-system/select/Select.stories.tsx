import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { List } from '../list/List';
import { SettingRow } from '../list/SettingRow';
import type { SelectItems } from '../option-list/selectItems';
import { StateCell, SurfaceStage } from '../storyHelpers';
import type { SurfaceContextValue } from '../surface';
import { useStoryVirtualFocus } from '../useStoryVirtualFocus';
import { Select } from './Select';

const qualities: SelectItems = [
  { value: 'auto', label: 'Automatic' },
  { value: '2160p', label: '4K', disabled: true },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
];

const meta = {
  title: 'Design System/Fields/Select',
  tags: ['autodocs'],
  component: Select,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "One choice behind a trigger that shows the value. The trigger is an inverted-fill action (white when focused) with a hairline border at rest on solid surfaces. One contract, two adapters: `native` uses the platform's picker (web default), `popup` opens an OptionList driven by virtual focus (TV default). While the popup is open it owns the keys: Up/Down move (clamped, skipping disabled options), Confirm chooses and closes, Back closes without changes. It takes its label from Field anatomy, or from a row such as SettingRow.",
      },
    },
  },
  args: {
    label: 'Preferred quality',
    items: qualities,
    value: 'auto',
    onChange: () => undefined,
    mode: 'native',
  },
  argTypes: {
    mode: { control: 'inline-radio', options: ['native', 'popup'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof Select>;

export const Playground: Story = {
  render: args => {
    const [value, setValue] = useState(args.value);
    return (
      <SurfaceStage surface="solid">
        <div style={{ minHeight: '20rem' }}>
          <Select
            {...(args as object)}
            items={qualities}
            label="Preferred quality"
            value={value}
            onChange={setValue}
          />
        </div>
      </SurfaceStage>
    );
  },
};

function StateMatrix({ surface }: { surface: SurfaceContextValue }) {
  const common = { items: qualities, onChange: () => undefined, mode: 'popup' as const };
  return (
    <SurfaceStage surface={surface}>
      {/* Room for an open popup: the story body clips what overflows it */}
      <div style={{ minHeight: '22rem' }}>
        <StateCell name="Rest">
          <Select {...common} label="Quality" value="1080p" />
        </StateCell>
        <StateCell name="Placeholder">
          <Select {...common} label="Quality" value={null} placeholder="Choose" />
        </StateCell>
        <StateCell name="Focused">
          <Select {...common} label="Quality" value="1080p" focused />
        </StateCell>
        <StateCell name="Invalid">
          <Select
            {...common}
            label="Quality"
            value={null}
            placeholder="Choose"
            error="Choose a quality."
          />
        </StateCell>
        <StateCell name="Disabled">
          <Select {...common} label="Quality" value="1080p" disabled />
        </StateCell>
      </div>
    </SurfaceStage>
  );
}

/** Focus is virtual: the navigation layer passes `focused`; here it is set directly. */
export const StatesOnSolid: Story = { render: () => <StateMatrix surface="solid" /> };
export const StatesOverMedia: Story = { render: () => <StateMatrix surface="overMedia" /> };

function TvSelect() {
  const [value, setValue] = useState<string | null>('auto');
  const [open, setOpen] = useState(false);
  const { containerRef, focus, isFocused } = useStoryVirtualFocus([['quality'], ['after']]);
  return (
    <SurfaceStage surface="solid">
      {/* Scopes Confirm to this example on the Docs page, where other stories show focus too */}
      <div ref={containerRef} style={{ minHeight: '22rem' }}>
        <Select
          label="Preferred quality"
          mode="popup"
          size="lg"
          items={qualities}
          value={value}
          onChange={setValue}
          focused={isFocused('quality') && !open}
          onPointerFocus={() => focus('quality')}
          onOpenChange={setOpen}
        />
        <p style={{ color: '#a6adaf' }}>Chosen: {value}</p>
      </div>
    </SurfaceStage>
  );
}

/**
 * The TV adapter: Confirm opens the popup on the chosen option; Down skips the disabled 4K and
 * clamps at the end; Confirm chooses; Back closes without changing anything.
 */
export const PopupWithVirtualFocus: Story = {
  render: () => <TvSelect />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Preferred quality Automatic' });
    await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    await userEvent.keyboard('{Enter}');
    const listbox = await canvas.findByRole('listbox', { name: 'Preferred quality' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const active = () => listbox.querySelector('[data-active]');
    await expect(active()).toHaveTextContent('Automatic');

    await userEvent.keyboard('{ArrowDown}');
    await expect(active()).toHaveTextContent('1080p');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}');
    await expect(active()).toHaveTextContent('480p');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(canvas.queryByRole('listbox')).toBeNull());
    await expect(canvas.getByText('Chosen: 480p')).toBeInTheDocument();
    await expect(trigger).toHaveAttribute('data-focused');

    // Back closes without changing the value
    await userEvent.keyboard('{Enter}{ArrowUp}{Escape}');
    await waitFor(() => expect(canvas.queryByRole('listbox')).toBeNull());
    await expect(canvas.getByText('Chosen: 480p')).toBeInTheDocument();

    // The pointer makes options active; a press chooses
    await userEvent.click(trigger);
    await userEvent.click(await canvas.findByRole('option', { name: '720p' }));
    await expect(canvas.getByText('Chosen: 720p')).toBeInTheDocument();
  },
};

function AudioSetting() {
  const [audio, setAudio] = useState<string | null>('en');
  return (
    <SurfaceStage surface="solid">
      <div style={{ maxWidth: '34rem', minHeight: '20rem' }}>
        <List label="Playback">
          <SettingRow
            title="Audio"
            description="Used when a title has several tracks."
            control={props => (
              <Select
                {...props}
                mode="popup"
                value={audio}
                onChange={setAudio}
                items={[
                  { label: 'Original', options: [{ value: 'en', label: 'English' }] },
                  {
                    label: 'Dubbed',
                    options: [
                      { value: 'it', label: 'Italian' },
                      { value: 'de', label: 'German' },
                    ],
                  },
                ]}
              />
            )}
          />
        </List>
      </div>
    </SurfaceStage>
  );
}

/** In a SettingRow the title names the select, and its value completes the name. */
export const InSettingRow: Story = {
  render: () => <AudioSetting />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Audio English' });
    await expect(trigger).toHaveAccessibleDescription('Used when a title has several tracks.');
    await userEvent.click(trigger);
    await expect(await canvas.findByRole('group', { name: 'Dubbed' })).toBeInTheDocument();
  },
};
