import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { StateCell, SurfaceStage } from '../storyHelpers';
import { useStoryVirtualFocus } from '../useStoryVirtualFocus';
import { Checkbox } from './Checkbox';
import { RadioGroup } from './RadioGroup';
import { Switch } from './Switch';

const meta = {
  title: 'Design System/Choices',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Checkbox, RadioGroup and Switch share one choice shell: a label wrapping the indicator (with its native control) and the text, so a press anywhere on it toggles. Choices cannot invert, so virtual focus (`focused`) is the white outline around the whole choice. Selection is a white fill with a dark mark, never the brand color. Confirm toggles or selects; arrows only move focus. Switch is for settings that apply at once, Checkbox for form and list choices, RadioGroup for one of a few visible options.',
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
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => undefined;
const cell = { width: '18rem' };

/** Focus is virtual: the navigation layer passes `focused`; here it is set directly. */
export const CheckboxStates: Story = {
  render: () => (
    <>
      {(
        [
          ['Off', {}],
          ['On', { checked: true }],
          ['Mixed', { indeterminate: true }],
          ['Focused', { focused: true }],
          ['On + focused', { checked: true, focused: true }],
          ['Description', { description: 'Includes specials and extras.' }],
          ['Invalid', { error: 'Accept the terms to continue.' }],
          ['Disabled', { disabled: true }],
          ['Disabled + on', { disabled: true, checked: true }],
        ] as const
      ).map(([name, props]) => (
        <StateCell key={name} name={name}>
          <div style={cell}>
            <Checkbox
              label="Download all seasons"
              checked={false}
              onCheckedChange={noop}
              {...props}
            />
          </div>
        </StateCell>
      ))}
    </>
  ),
};

export const SwitchStates: Story = {
  render: () => (
    <>
      {(
        [
          ['Off', {}],
          ['On', { checked: true }],
          ['Focused', { focused: true }],
          ['On + focused', { checked: true, focused: true }],
          ['Description', { checked: true, description: 'Marks episodes as watched on Trakt.' }],
          ['Disabled', { disabled: true }],
          ['Disabled + on', { disabled: true, checked: true }],
        ] as const
      ).map(([name, props]) => (
        <StateCell key={name} name={name}>
          <div style={cell}>
            <Switch label="Episode syncing" checked={false} onCheckedChange={noop} {...props} />
          </div>
        </StateCell>
      ))}
    </>
  ),
};

const qualities = [
  { value: 'auto', label: 'Automatic', description: 'Best quality your connection allows.' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '4k', label: '4K', disabled: true },
] as const;

export const RadioGroupStates: Story = {
  render: () => (
    <>
      <StateCell name="Vertical, 720p focused">
        <div style={cell}>
          <RadioGroup
            label="Preferred quality"
            options={qualities}
            value="auto"
            onChange={noop}
            focusedValue="720p"
          />
        </div>
      </StateCell>
      <StateCell name="Horizontal, invalid">
        <div style={{ width: '26rem' }}>
          <RadioGroup
            label="Audio"
            orientation="horizontal"
            options={[
              { value: 'original', label: 'Original' },
              { value: 'dubbed', label: 'Dubbed' },
            ]}
            value={null}
            onChange={noop}
            error="Choose an audio track."
          />
        </div>
      </StateCell>
    </>
  ),
};

function PlaybackSettings() {
  const { containerRef, focus, isFocused, focusedId } = useStoryVirtualFocus([
    ['sync'],
    ['quality:auto'],
    ['quality:1080p'],
    ['quality:720p'],
    ['subtitles'],
  ]);
  const [sync, setSync] = useState(false);
  const [quality, setQuality] = useState<string | null>('auto');
  const [subtitles, setSubtitles] = useState(false);
  const focusedQuality = focusedId.startsWith('quality:') ? focusedId.slice(8) : undefined;
  return (
    <div ref={containerRef} style={{ width: '22rem' }}>
      <Switch
        label="Episode syncing"
        checked={sync}
        onCheckedChange={setSync}
        focused={isFocused('sync')}
        onPointerFocus={() => focus('sync')}
      />
      <div style={{ height: '1.5rem' }} />
      <RadioGroup
        label="Preferred quality"
        options={qualities.slice(0, 3)}
        value={quality}
        onChange={setQuality}
        focusedValue={focusedQuality}
        onPointerFocus={value => focus(`quality:${value}`)}
      />
      <div style={{ height: '1rem' }} />
      <Checkbox
        label="Always show subtitles"
        checked={subtitles}
        onCheckedChange={setSubtitles}
        focused={isFocused('subtitles')}
        onPointerFocus={() => focus('subtitles')}
      />
    </div>
  );
}

/**
 * One virtual focus over a switch, a radio group and a checkbox: Up/Down move, Confirm toggles or
 * selects the focused choice. Moving onto a radio never selects it.
 */
export const VirtualFocus: Story = {
  render: () => <PlaybackSettings />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sync = canvas.getByRole('switch', { name: 'Episode syncing' });
    await userEvent.keyboard('{Enter}');
    await expect(sync).toHaveAttribute('aria-checked', 'true');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    const p720 = canvas.getByRole('radio', { name: '720p' });
    await expect(p720.closest('label')).toHaveAttribute('data-focused');
    await expect(canvas.getByRole('radio', { name: /Automatic/ })).toBeChecked();
    await userEvent.keyboard('{Enter}');
    await expect(p720).toBeChecked();

    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(canvas.getByRole('checkbox', { name: 'Always show subtitles' })).toBeChecked();

    // A press on the label toggles, and the pointer focuses what it moves onto
    await userEvent.click(canvas.getByText('Episode syncing'));
    await expect(sync).toHaveAttribute('aria-checked', 'false');
    await expect(sync.closest('label')).toHaveAttribute('data-focused');
  },
};
