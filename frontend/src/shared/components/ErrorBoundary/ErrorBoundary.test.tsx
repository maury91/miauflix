import { Component } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '@/__test-utils__';

import { ErrorBoundary } from './ErrorBoundary';

// Component that throws an error
class ThrowError extends Component<{ shouldThrow: boolean }> {
  override render() {
    if (this.props.shouldThrow) {
      throw new Error('Test error');
    }
    return <div>No error</div>;
  }
}

// Custom fallback component
const CustomFallback = ({ error, resetError }: { error?: Error; resetError: () => void }) => (
  <div>
    <div>Custom Error: {error?.message}</div>
    <button onClick={resetError}>Reset</button>
  </div>
);

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress console.error for tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('renders default fallback when error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={CustomFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Error: Test error')).toBeInTheDocument();
    expect(screen.getByText('Reset')).toBeInTheDocument();
  });

  it('calls onError callback when error occurs', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Test error',
      }),
      expect.objectContaining({
        componentStack: expect.any(String),
      })
    );
  });

  it('resets error state when resetError is called', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Click reset button
    screen.getByText('Try Again').click();

    // Rerender with no error
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('shows error details in development', () => {
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Technical Details')).toBeInTheDocument();

    process.env['NODE_ENV'] = originalEnv;
  });
});
