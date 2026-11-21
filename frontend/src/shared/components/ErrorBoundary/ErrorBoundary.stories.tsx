import { Button, EmptyState } from '@shared/design-system';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ErrorBoundary } from './ErrorBoundary';

const meta: Meta<typeof ErrorBoundary> = {
  title: 'Shared/ErrorBoundary',
  component: ErrorBoundary,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('This is a test error for the ErrorBoundary');
  }
  return <div>No error here!</div>;
};

export const Default: Story = {
  render: () => (
    <ErrorBoundary>
      <ThrowError shouldThrow={true} />
    </ErrorBoundary>
  ),
};

export const WithCustomFallback: Story = {
  render: () => (
    <ErrorBoundary
      fallback={({ error, resetError }) => (
        <EmptyState
          heading="Custom Error Fallback"
          actions={<Button onClick={resetError}>Reset</Button>}
        >
          Error: {error?.message}
        </EmptyState>
      )}
    >
      <ThrowError shouldThrow={true} />
    </ErrorBoundary>
  ),
};

export const WithoutError: Story = {
  render: () => (
    <ErrorBoundary>
      <ThrowError shouldThrow={false} />
    </ErrorBoundary>
  ),
};
