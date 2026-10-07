import type { Meta, StoryObj } from '@storybook/react-vite';

import { Alert } from './Alert';

const meta = {
  title: 'Miauflix UI/Components/Alert',
  component: Alert,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Use Alert for contextual feedback after a user action. Error uses role=alert; info, success and warning use role=status. Explain what happened and the next action. A validation-only service test is info, not success. Keep field errors adjacent to the input and linked with aria-describedby. Use role=note for static guidance to avoid unnecessary live announcements.',
      },
    },
  },
  args: { children: 'Your settings were saved.' },
} satisfies Meta<typeof Alert>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Success: Story = { args: { severity: 'success' } };
export const Error: Story = {
  args: {
    severity: 'error',
    children: 'Unable to save. Check the highlighted settings and try again.',
  },
};
export const Warning: Story = {
  args: { severity: 'warning', children: 'These changes require a restart.' },
};
export const Info: Story = {
  args: {
    severity: 'info',
    children: 'Format validated. The live connection has not been tested.',
  },
};
