import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HomeSidebar } from './HomeSidebar';

describe('HomeSidebar', () => {
  it('keeps Search and Settings accessible, without a Home item, when the rail is collapsed', () => {
    const onSettings = vi.fn();
    render(
      <HomeSidebar
        active={false}
        onAction={() => ({ type: 'handled' })}
        onHover={vi.fn()}
        onSettings={onSettings}
        onSearch={vi.fn()}
        onNotifications={vi.fn()}
        notificationsRef={null}
        unreadCount={0}
      />
    );

    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings).toBeInTheDocument();

    fireEvent.click(settings);
    expect(onSettings).toHaveBeenCalledTimes(1);
  });
});
