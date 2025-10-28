import { describe, expect, it } from 'vitest';

import { render, screen } from '@/__test-utils__';

import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('should render with default props', () => {
    render(<Spinner text="Loading..." />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    // Check that the spinner icon is present (svg element)
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('should render with different props', () => {
    const { rerender } = render(<Spinner size={20} />);

    // Should have spinner icon but no text when text is undefined
    expect(document.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();

    // Test different sizes
    rerender(<Spinner text="Small" size={16} />);
    const smallIcon = document.querySelector('svg');
    expect(smallIcon).toHaveAttribute('width', '16');
    expect(smallIcon).toHaveAttribute('height', '16');
    expect(screen.getByText('Small')).toBeInTheDocument();

    // Test larger size
    rerender(<Spinner text="Large" size={32} />);
    const largeIcon = document.querySelector('svg');
    expect(largeIcon).toHaveAttribute('width', '32');
    expect(largeIcon).toHaveAttribute('height', '32');
    expect(screen.getByText('Large')).toBeInTheDocument();
  });

  it('should have proper container styling', () => {
    render(<Spinner text="Loading..." />);

    const container = screen.getByText('Loading...').parentElement;
    const styles = window.getComputedStyle(container!);

    expect(styles.display).toBe('flex');
    expect(styles.alignItems).toBe('center');
    expect(styles.justifyContent).toBe('center');
  });

  it('should render custom text', () => {
    render(<Spinner text="Generating QR code" size={24} />);

    expect(screen.getByText('Generating QR code')).toBeInTheDocument();
  });

  it('should render without text', () => {
    render(<Spinner size={20} />);

    expect(document.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
});
