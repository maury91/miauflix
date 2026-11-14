import type { Meta, StoryObj } from '@storybook/react-vite';

import { StateCell, SurfaceStage } from '../storyHelpers';
import { TextArea } from './TextArea';

const meta = {
  title: 'Design System/Fields/TextArea',
  tags: ['autodocs'],
  component: TextArea,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Multiline text with the same Field anatomy and frame as TextField. Confirm enters edit mode; while editing Enter inserts a new line and Escape or Back ends editing.',
      },
    },
  },
  args: {
    label: 'Notes',
    placeholder: 'Anything to remember about this source',
    rows: 3,
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
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const States: Story = {
  render: () => (
    <>
      {(
        [
          ['Rest', {}],
          ['Focused', { focused: true }],
          ['Invalid + focused', { focused: true, error: 'Keep it under 500 characters.' }],
          ['Disabled', { disabled: true, defaultValue: 'Read from the server' }],
        ] as const
      ).map(([name, props]) => (
        <StateCell key={name} name={name}>
          <div style={{ width: '16rem' }}>
            <TextArea label="Notes" description="Only you can see these." {...props} />
          </div>
        </StateCell>
      ))}
    </>
  ),
};
