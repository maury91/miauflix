import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fireEvent, userEvent, within } from 'storybook/test';

import { Button } from '../button/Button';
import { List } from '../list/List';
import { SettingRow } from '../list/SettingRow';
import { StateCell, SurfaceStage } from '../storyHelpers';
import { useStoryVirtualFocus } from '../useStoryVirtualFocus';
import { Slider } from './Slider';

const meta = {
  title: 'Design System/Fields/Slider',
  tags: ['autodocs'],
  component: Slider,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A value in a range, horizontal, with an optional label, value text and marks. A drawn track and thumb sit under the native range input, laid invisibly over them, so dragging, touch, desktop keys and assistive technology stay native. Sliders cannot invert: virtual focus is the white outline (and a larger thumb). While focused it owns Left/Right, adjusting by `keyStep` and clamping at the limits; Up/Down stay with the navigation layer. Value text and mark labels come from the feature (i18n); what the value means stays with it too.',
      },
    },
  },
  args: { label: 'Volume', value: 40, onChange: () => undefined },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

const cell = { width: '16rem' };
const noop = () => undefined;

function States() {
  return (
    <>
      <StateCell name="Rest">
        <div style={cell}>
          <Slider label="Volume" value={40} valueText="40%" onChange={noop} />
        </div>
      </StateCell>
      <StateCell name="Focused">
        <div style={cell}>
          <Slider label="Volume" value={40} valueText="40%" onChange={noop} focused />
        </div>
      </StateCell>
      <StateCell name="Disabled">
        <div style={cell}>
          <Slider label="Volume" value={40} valueText="40%" onChange={noop} disabled />
        </div>
      </StateCell>
      <StateCell name="Marks, labelled ends">
        <div style={cell}>
          <Slider
            label="Subtitle size"
            value={100}
            min={50}
            max={200}
            step={25}
            valueText="100%"
            marks={[
              { value: 50, label: 'Small' },
              { value: 100 },
              { value: 150 },
              { value: 200, label: 'Large' },
            ]}
            onChange={noop}
          />
        </div>
      </StateCell>
      <StateCell name="Described, at the limit">
        <div style={cell}>
          <Slider
            label="Subtitle delay"
            description="Positive values show subtitles later."
            value={5}
            min={-5}
            max={5}
            step={0.1}
            valueText="+5.0 s"
            onChange={noop}
          />
        </div>
      </StateCell>
    </>
  );
}

/** Focus is virtual: the navigation layer passes `focused`; here it is set directly. */
export const OnCanvas: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <States />
    </SurfaceStage>
  ),
};

export const OverMedia: Story = {
  render: () => (
    <SurfaceStage surface="overMedia">
      <States />
    </SurfaceStage>
  ),
};

const percent = (value: number) => `${value}%`;

function Playback() {
  const { containerRef, focus, isFocused } = useStoryVirtualFocus([
    ['volume'],
    ['brightness'],
    ['done'],
  ]);
  const [volume, setVolume] = useState(90);
  const [brightness, setBrightness] = useState(50);
  return (
    <div ref={containerRef} style={{ maxWidth: '24rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Slider
          label="Volume"
          value={volume}
          step={1}
          keyStep={5}
          valueText={percent(volume)}
          onChange={setVolume}
          focused={isFocused('volume')}
          onPointerFocus={() => focus('volume')}
        />
      </div>
      <div style={{ marginBottom: '1.5rem' }}>
        <Slider
          label="Brightness"
          value={brightness}
          step={10}
          valueText={percent(brightness)}
          marks={[{ value: 0, label: 'Dark' }, { value: 50 }, { value: 100, label: 'Bright' }]}
          onChange={setBrightness}
          focused={isFocused('brightness')}
          onPointerFocus={() => focus('brightness')}
        />
      </div>
      <Button focused={isFocused('done')} onMouseMove={() => focus('done')}>
        Done
      </Button>
    </div>
  );
}

/**
 * Left/Right adjust the focused slider by its key step (5 for volume, 10 for brightness) and clamp
 * at the limits; Up/Down move between sliders as usual.
 */
export const VirtualFocus: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <Playback />
    </SurfaceStage>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const volume = canvas.getByRole('slider', { name: 'Volume' });
    await expect(volume).toHaveAttribute('aria-valuetext', '90%');
    await userEvent.keyboard('{ArrowRight}');
    await expect(volume).toHaveValue('95');
    // Clamps at the limit instead of leaving the slider
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    await expect(volume).toHaveValue('100');
    await userEvent.keyboard('{ArrowLeft}');
    await expect(volume).toHaveValue('95');

    await userEvent.keyboard('{ArrowDown}');
    const brightness = canvas.getByRole('slider', { name: 'Brightness' });
    await expect(brightness.closest('[data-focused]')).not.toBeNull();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(brightness).toHaveValue('40');
    await expect(volume).toHaveValue('95');

    // The native input: a drag or desktop key lands on the step grid
    fireEvent.change(brightness, { target: { value: '70' } });
    await expect(brightness).toHaveAttribute('aria-valuetext', '70%');
  },
};

function RightToLeftSlider() {
  const [value, setValue] = useState(50);
  return (
    <div dir="rtl" style={{ maxWidth: '20rem' }}>
      <Slider
        label="Volume"
        value={value}
        step={10}
        valueText={percent(value)}
        marks={[
          { value: 0, label: 'Low' },
          { value: 100, label: 'High' },
        ]}
        onChange={setValue}
        focused
      />
    </div>
  );
}

/** Right-to-left: the track fills from the right, and Left raises the value. */
export const RightToLeft: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <RightToLeftSlider />
    </SurfaceStage>
  ),
  play: async ({ canvasElement }) => {
    const slider = within(canvasElement).getByRole('slider', { name: 'Volume' });
    await userEvent.keyboard('{ArrowLeft}');
    await expect(slider).toHaveValue('60');
  },
};

function SettingSlider() {
  const [size, setSize] = useState(100);
  return (
    <List label="Subtitles" divided>
      <SettingRow
        title="Subtitle size"
        description="Applies to every title on this profile."
        value={percent(size)}
        control={props => (
          <div style={{ width: '14rem' }}>
            <Slider
              {...props}
              value={size}
              min={50}
              max={200}
              step={25}
              valueText={percent(size)}
              onChange={setSize}
            />
          </div>
        )}
      />
    </List>
  );
}

/**
 * In a SettingRow the slider is named by the row's title and described by its description; the row
 * shows the value.
 */
export const InSettingRow: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <div style={{ maxWidth: '40rem' }}>
        <SettingSlider />
      </div>
    </SurfaceStage>
  ),
  play: async ({ canvasElement }) => {
    const slider = within(canvasElement).getByRole('slider', { name: 'Subtitle size' });
    await expect(slider).toHaveAccessibleDescription('Applies to every title on this profile.');
  },
};
