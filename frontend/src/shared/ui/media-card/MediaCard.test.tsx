import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MediaCard } from './MediaCard';

const setupTest = (props: Partial<React.ComponentProps<typeof MediaCard>> = {}) => {
  const onClick = vi.fn();
  const ref = createRef<HTMLButtonElement>();
  const result = render(
    <MediaCard
      ref={ref}
      backdrop="backdrop.jpg"
      logo="logo.png"
      title="Orbital"
      onClick={onClick}
      {...props}
    />
  );
  return { ...result, onClick, ref };
};

describe('MediaCard', () => {
  it('renders separate decorative images, an accessible title and a visible episode label', () => {
    const { container, ref, onClick } = setupTest({ subtitle: 'S2 E6' });
    const card = screen.getByRole('button', { name: 'Orbital · S2 E6' });
    expect(ref.current).toBe(card);
    expect(container.querySelectorAll('img')).toHaveLength(2);
    expect(screen.queryByText('Orbital')).not.toBeInTheDocument();
    expect(screen.getByText('S2 E6')).toBeVisible();
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('falls back to text for a missing or failed logo, and accepts a new logo', () => {
    const { container, rerender } = setupTest();
    fireEvent.error(container.querySelector('img[src="logo.png"]')!);
    expect(screen.getByText('Orbital')).toBeVisible();
    rerender(<MediaCard backdrop="backdrop.jpg" logo="new-logo.png" title="Orbital" />);
    expect(screen.queryByText('Orbital')).not.toBeInTheDocument();
    rerender(<MediaCard backdrop="backdrop.jpg" logo={null} title="Orbital" />);
    expect(screen.getByText('Orbital')).toBeVisible();
  });

  it.each([
    [null, null],
    [0, '0% watched'],
    [40, '40% watched'],
    [150, '100% watched'],
    [-10, '0% watched'],
    [NaN, '0% watched'],
  ])('handles progress %s', (progress, label) => {
    const { container } = setupTest({ progress });
    if (label) expect(screen.getByLabelText(label)).toBeInTheDocument();
    else expect(container.querySelector('[aria-label$="watched"]')).toBeNull();
  });

  it('prevents activation when disabled and forwards roving focus attributes', () => {
    const { onClick } = setupTest({ disabled: true, tabIndex: -1, 'aria-current': 'true' });
    const card = screen.getByRole('button', { name: 'Orbital' });
    expect(card).toBeDisabled();
    expect(card).toHaveAttribute('tabindex', '-1');
    expect(card).toHaveAttribute('aria-current', 'true');
    fireEvent.click(card);
    expect(onClick).not.toHaveBeenCalled();
  });
});
