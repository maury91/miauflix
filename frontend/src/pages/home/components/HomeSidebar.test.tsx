import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HomeSidebar } from './HomeSidebar';

describe('HomeSidebar', () => {
  it('keeps Home and Settings accessible when the rail is collapsed', () => {
    const onSettings = vi.fn();
    render(
      <HomeSidebar
        active={false}
        onAction={() => ({ type: 'handled' })}
        onHover={vi.fn()}
        onSettings={onSettings}
      />
    );

    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings).toBeInTheDocument();

    fireEvent.click(settings);
    expect(onSettings).toHaveBeenCalledTimes(1);
  });
});
