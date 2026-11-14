import type { Meta, StoryObj } from '@storybook/react-vite';

import { SurfaceStage } from '../storyHelpers';
import { OptionList } from './OptionList';

const meta = {
  title: 'Design System/Collections/OptionList',
  tags: ['autodocs'],
  component: OptionList,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "Choices as inverted-fill rows: the active option (the list's virtual focus) is white with black text, the chosen one has a check and, on its own, a translucent fill. Disabled options stay visible and are skipped. The owner (Select, a player popover) drives movement and choosing.",
      },
    },
  },
  args: {
    label: 'Audio',
    value: 'en',
    activeValue: 'it',
    onSelect: () => undefined,
    items: [
      {
        label: 'Original',
        options: [{ value: 'en', label: 'English 5.1' }],
      },
      {
        label: 'Dubbed',
        options: [
          { value: 'it', label: 'Italian' },
          { value: 'de', label: 'German' },
          { value: 'ja', label: 'Japanese (unavailable)', disabled: true },
        ],
      },
    ],
  },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <div style={{ width: '18rem', background: '#182023', borderRadius: '1rem' }}>
          <Story />
        </div>
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof OptionList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** English is chosen (check), Italian is active (white). */
export const Groups: Story = {};

export const ActiveIsChosen: Story = { args: { activeValue: 'en' } };
