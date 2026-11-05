import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HomeSidebar } from './HomeSidebar';

describe('HomeSidebar', () => {
  it('keeps Search and Settings accessible, without a Home item, when the rail is collapsed', () => {
    const onSettings = vi.fn();
    render(
      <HomeSidebar
        active={false}
        showSettings={true}
        onAction={() => ({ type: 'handled' })}
        onHover={vi.fn()}
        onSettings={onSettings}
        onSearch={vi.fn()}
        onEnterNotifications={vi.fn()}
        unreadCount={0}
        hasNotifications={false}
      />
    );

    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings).toBeInTheDocument();

    fireEvent.click(settings);
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('should hide Settings, when showSettings is false', () => {
    render(
      <HomeSidebar
        active={false}
        showSettings={false}
        onAction={() => ({ type: 'handled' })}
        onHover={vi.fn()}
        onSettings={vi.fn()}
        onSearch={vi.fn()}
        onEnterNotifications={vi.fn()}
        unreadCount={0}
        hasNotifications={false}
      />
    );

    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('stays open when the pointer moves onto the notifications panel', () => {
    const onAction = vi.fn(() => ({ type: 'handled' as const }));
    render(
      <>
        <HomeSidebar
          active
          showSettings={false}
          onAction={onAction}
          onHover={vi.fn()}
          onSettings={vi.fn()}
          onSearch={vi.fn()}
          onEnterNotifications={vi.fn()}
          unreadCount={3}
          hasNotifications
        />
        <div data-notifications-panel="" data-testid="panel" />
      </>
    );
    const rail = screen.getByRole('complementary', { name: 'Home navigation' });

    fireEvent.mouseLeave(rail, { relatedTarget: screen.getByTestId('panel') });
    expect(onAction).not.toHaveBeenCalled();

    fireEvent.mouseLeave(rail, { relatedTarget: document.body });
    expect(onAction).toHaveBeenCalledWith('right');
  });

  it('enters the notifications panel from the bell and shows the unread count', () => {
    const onEnterNotifications = vi.fn();
    render(
      <HomeSidebar
        active={false}
        showSettings={false}
        onAction={() => ({ type: 'handled' })}
        onHover={vi.fn()}
        onSettings={vi.fn()}
        onSearch={vi.fn()}
        onEnterNotifications={onEnterNotifications}
        unreadCount={120}
        hasNotifications
      />
    );

    expect(screen.getByText('99+')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 120 unread' }));
    expect(onEnterNotifications).toHaveBeenCalledTimes(1);
  });

  it.each([
    { hasNotifications: false, entered: 0 },
    { hasNotifications: true, entered: 1 },
  ])(
    'moves Right from the bell into the panel only when there are notifications ($hasNotifications)',
    ({ hasNotifications, entered }) => {
      const onEnterNotifications = vi.fn();
      const onAction = vi.fn(() => ({ type: 'handled' as const }));
      render(
        <HomeSidebar
          active
          showSettings={false}
          onAction={onAction}
          onHover={vi.fn()}
          onSettings={vi.fn()}
          onSearch={vi.fn()}
          onEnterNotifications={onEnterNotifications}
          unreadCount={0}
          hasNotifications={hasNotifications}
        />
      );

      const search = screen.getByRole('button', { name: 'Search' });
      fireEvent.keyDown(search, { key: 'ArrowUp' });
      const bell = screen.getByRole('button', { name: 'Notifications' });
      expect(bell).toHaveFocus();
      fireEvent.keyDown(bell, { key: 'ArrowRight' });

      expect(onEnterNotifications).toHaveBeenCalledTimes(entered);
      expect(onAction).not.toHaveBeenCalled();
      expect(bell).toHaveFocus();
    }
  );
});
