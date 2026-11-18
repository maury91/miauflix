import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { InitialFocus, NavigationStage, SurfaceStage } from '../storyHelpers';
import { storyImage } from '../storyImage';
import { ChoiceTileGroup } from './ChoiceTileGroup';

const meta = {
  title: 'Design System/Choices/ChoiceTileGroup',
  tags: ['autodocs'],
  component: ChoiceTileGroup,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "One choice among options shown as pictures (`tile`: a decorative visual with the name under it) or colours (`swatch`: a circle named by its label), such as a Plushie's shape, fabric or colour. RadioGroup semantics: moving focus never chooses, Confirm or a press does. The options wrap on a spatial group entered at the chosen option. The chosen option is the translucent fill with a white ring; focus is the white outline outside.",
      },
    },
  },
  args: { label: 'Choice', options: [], value: '', onChange: () => undefined },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof ChoiceTileGroup>;

export default meta;
type Story = StoryObj<typeof ChoiceTileGroup>;

const colors = [
  { value: 'coral', label: 'Coral', color: '#e07a5f' },
  { value: 'teal', label: 'Teal', color: '#3fb8ad' },
  { value: 'violet', label: 'Violet', color: '#a65ce8' },
];

const pictures = ['Plush', 'Felt', 'Velvet', 'Shaggy', 'Fleece'].map((label, index) => ({
  value: label.toLowerCase(),
  label,
  visual: (
    <img
      src={storyImage(['#f4d58d', '#b5e48c', '#e07a5f', '#a65ce8', '#3fb8ad'][index]!, '#1e6091')}
      alt=""
      style={{ display: 'block', width: '100%', borderRadius: '0.25rem' }}
    />
  ),
}));

function Look() {
  const [color, setColor] = useState('teal');
  const [fabric, setFabric] = useState('felt');
  return (
    <NavigationStage>
      <div style={{ maxWidth: '24rem' }}>
        <ChoiceTileGroup
          label="Color"
          shape="swatch"
          navId="color"
          options={colors}
          value={color}
          onChange={setColor}
        />
        <div style={{ height: '1.5rem' }} />
        <ChoiceTileGroup
          label="Fabric"
          navId="fabric"
          options={pictures}
          value={fabric}
          onChange={setFabric}
        />
      </div>
      <InitialFocus id="color:teal" />
    </NavigationStage>
  );
}

export const SwatchesAndTiles: Story = {
  render: () => <Look />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const teal = canvas.getByRole('radio', { name: 'Teal' });
    await expect(teal).toHaveAttribute('data-focused');
    // Moving never chooses
    await userEvent.keyboard('{ArrowRight}');
    const violet = canvas.getByRole('radio', { name: 'Violet' });
    await expect(violet).toHaveAttribute('data-focused');
    await expect(teal).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{Enter}');
    await expect(violet).toHaveAttribute('aria-checked', 'true');
    // Down enters the next group at its chosen option
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('radio', { name: 'Felt' })).toHaveAttribute('data-focused');
  },
};
