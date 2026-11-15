import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { InitialFocus, NavigationStage, StateCell, SurfaceStage } from '../storyHelpers';
import { NumberField } from './NumberField';

const meta = {
  title: 'Design System/Fields/NumberField',
  tags: ['autodocs'],
  component: NumberField,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A number, typed or stepped. Typing is free while editing and committed when editing ends or on Enter: empty is `null`, unreadable text reverts, values are clamped to `min`/`max`. With step labels, − and + sit around the input (Left/Right: decrement → input → increment). Formatting and parsing come from the feature (i18n).',
      },
    },
  },
  args: {
    label: 'Download limit (MB/s)',
    value: 10,
    onChange: () => undefined,
    size: 'md',
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof NumberField>;

export default meta;
type Story = StoryObj<typeof NumberField>;

const steps = { decrementLabel: 'Decrease', incrementLabel: 'Increase' } as const;

export const States: Story = {
  render: () => (
    <>
      {(
        [
          ['Plain', {}],
          ['Steppers', steps],
          ['Input focused', { ...steps, focusedPart: 'input' }],
          ['Increment focused', { ...steps, focusedPart: 'increment' }],
          ['Invalid', { ...steps, error: 'Use a value from 1 to 100.' }],
          ['Disabled', { ...steps, disabled: true }],
        ] as const
      ).map(([name, props]) => (
        <StateCell key={name} name={name}>
          <div style={{ width: '14rem' }}>
            <NumberField label="Download limit" value={10} onChange={() => undefined} {...props} />
          </div>
        </StateCell>
      ))}
    </>
  ),
};

function LiveNumber() {
  const [value, setValue] = useState<number | null>(98);
  return (
    <NavigationStage>
      <div style={{ width: '14rem' }}>
        <NumberField
          label="Volume"
          value={value}
          onChange={setValue}
          min={0}
          max={100}
          step={1}
          {...steps}
          navId="volume"
        />
        <p style={{ color: '#a6adaf' }}>Value: {String(value)}</p>
      </div>
      <InitialFocus id="volume" part="increment" />
    </NavigationStage>
  );
}

export const StepsAndClamps: Story = {
  render: () => <LiveNumber />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Volume');
    // Confirm on the focused + steps; the maximum clamps
    await userEvent.keyboard('{Enter}{Enter}{Enter}');
    await expect(input).toHaveValue('100');
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{Enter}');
    await expect(input).toHaveValue('99');
    // Typing commits when editing ends: out of range clamps, unreadable text reverts
    await userEvent.keyboard('{ArrowRight}{Enter}');
    await expect(input).toHaveFocus();
    await userEvent.clear(input);
    await userEvent.keyboard('250{Enter}');
    await expect(canvas.getByText('Value: 100')).toBeInTheDocument();
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.keyboard('loud');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(input).toHaveValue('100'));
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.keyboard('{Escape}');
    await expect(await canvas.findByText('Value: null')).toBeInTheDocument();
  },
};
