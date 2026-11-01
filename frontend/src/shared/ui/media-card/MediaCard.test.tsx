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
  it('leaves the focus treatment to whatever draws it externally', () => {
    setupTest({ focused: true, externalFocus: true });
    const card = screen.getByRole('button', { name: 'Orbital' });
    expect(card).not.toHaveAttribute('data-focused');
    expect(card).toHaveAttribute('data-external-focus');
  });

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

  it('keeps its classes static: size, state and progress are inline styles and attributes', () => {
    const { container, rerender } = setupTest({ width: 320, progress: 10 });
    const classesOf = () =>
      Array.from(container.querySelectorAll('*'), element => element.getAttribute('class'));
    const card = screen.getByRole('button', { name: 'Orbital' });
    const before = classesOf();
    expect(card).toHaveStyle({ width: '320px', fontSize: '17.77777777777778px' });
    expect(card).not.toHaveAttribute('data-focused');

    rerender(
      <MediaCard
        backdrop="backdrop.jpg"
        logo="logo.png"
        title="Orbital"
        width={480}
        progress={75}
        focused
        hovered
      />
    );
    expect(classesOf()).toEqual(before);
    expect(card).toHaveStyle({ width: '480px', fontSize: '26.666666666666668px' });
    expect(card).toHaveAttribute('data-focused', 'true');
    expect(card).toHaveAttribute('data-hovered', 'true');
    expect(screen.getByLabelText('75% watched').firstElementChild).toHaveStyle({ width: '75%' });
  });

  it('merges a caller class name and style', () => {
    setupTest({ className: 'extra', style: { marginLeft: 4 }, width: 360 });
    const card = screen.getByRole('button', { name: 'Orbital' });
    expect(card).toHaveClass('extra');
    expect(card.classList.length).toBe(2);
    expect(card).toHaveStyle({ marginLeft: '4px', fontSize: '20px' });
  });
});
