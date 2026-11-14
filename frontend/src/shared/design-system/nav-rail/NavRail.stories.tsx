import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../button/Button';
import { StateCell } from '../storyHelpers';
import { storyImage } from '../storyImage';
import { color, fontFamily, space, typeScale } from '../tokens';
import { useStoryVirtualFocus } from '../useStoryVirtualFocus';
import { NavItem, NavRail } from './NavRail';

import BackIcon from '~icons/mdi/arrow-left';
import BellIcon from '~icons/mdi/bell-outline';
import SettingsIcon from '~icons/mdi/cog-outline';
import HomeIcon from '~icons/mdi/home-outline';
import SearchIcon from '~icons/mdi/magnify';

const meta = {
  title: 'Design System/Navigation/NavRail',
  tags: ['autodocs'],
  component: NavRail,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The navigation column. NavItems are inverted-fill actions: the current route is translucent with `aria-current="page"`, the focused item is white; brand red is never a nav fill. Compact, items are circles around their icons and labels stay their accessible names; expanded (on TV, while the rail holds focus) the labels fade in and the panel overlays the page without reflowing it. A badge is a short count formatted by the feature, with its meaning read after the name. On inner pages the rail holds only Back, kept on every platform alongside the remote Back key.',
      },
    },
  },
  args: { label: 'Main', children: null },
} satisfies Meta<typeof NavRail>;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => undefined;

function Stage({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        height: '24rem',
        // Stand-in artwork, so the rail's edge shows against the page
        backgroundColor: color.canvas,
        backgroundImage: `url("${storyImage('#264653', '#6d597a')}")`,
        backgroundSize: 'cover',
      }}
    >
      {children}
    </div>
  );
}

const destinations = [
  { id: 'home', label: 'Home', icon: <HomeIcon /> },
  { id: 'search', label: 'Search', icon: <SearchIcon /> },
  { id: 'notifications', label: 'Notifications', icon: <BellIcon /> },
] as const;

/** Compact and expanded; Home is current, Search holds focus, Notifications has a badge. */
export const States: Story = {
  render: () => (
    <div style={{ display: 'flex' }}>
      {[false, true].map(expanded => (
        <StateCell key={String(expanded)} name={expanded ? 'Expanded' : 'Compact'}>
          <div style={{ display: 'flex', width: '16rem', height: '20rem' }}>
            <NavRail
              label="Main"
              expanded={expanded}
              end={<NavItem icon={<SettingsIcon />} label="Settings" onClick={noop} />}
            >
              {destinations.map(item => (
                <NavItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  current={item.id === 'home'}
                  focused={item.id === 'search'}
                  badge={item.id === 'notifications' ? '99+' : undefined}
                  badgeLabel={item.id === 'notifications' ? '120 unread' : undefined}
                  onClick={noop}
                />
              ))}
            </NavRail>
          </div>
        </StateCell>
      ))}
      <StateCell name="Badge on a focused item">
        <div style={{ display: 'flex', width: '16rem', height: '20rem' }}>
          <NavRail label="Main" expanded>
            <NavItem
              icon={<BellIcon />}
              label="Notifications"
              badge="3"
              badgeLabel="3 unread"
              focused
              onClick={noop}
            />
          </NavRail>
        </div>
      </StateCell>
    </div>
  ),
};

const pageText = {
  margin: `0 0 ${space.md}`,
  color: color.text,
  fontFamily,
  fontSize: typeScale.heading.fontSize,
  lineHeight: typeScale.heading.lineHeight,
  fontWeight: typeScale.heading.fontWeight,
};

function Home() {
  const [route, setRoute] = useState('home');
  const { containerRef, focus, isFocused, focusedId } = useStoryVirtualFocus(
    [
      ['nav:home', 'page:play', 'page:info'],
      ['nav:search'],
      ['nav:notifications'],
      ['nav:settings'],
    ],
    'page:play'
  );
  // The pointer over the rail expands it before an item takes focus
  const [hovered, setHovered] = useState(false);
  const inRail = focusedId.startsWith('nav:');
  const expanded = inRail || hovered;

  // Right or Back from any rail item (none has a submenu) leaves the rail for the page element it
  // was entered from, as the navigation layer restores a scope's last focus
  const lastPage = useRef('page:play');
  if (focusedId.startsWith('page:')) lastPage.current = focusedId;
  const inRailRef = useRef(inRail);
  inRailRef.current = inRail;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!inRailRef.current) return;
      const keyAction = getKeyboardAction(event);
      if (keyAction !== 'right' && keyAction !== 'back') return;
      event.preventDefault();
      // Before the story's grid navigation, which listens in the bubble phase
      event.stopImmediatePropagation();
      focus(lastPage.current);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [focus]);
  const item = (id: string) => ({
    current: route === id,
    focused: isFocused(`nav:${id}`),
    onMouseMove: () => focus(`nav:${id}`),
    onClick: () => setRoute(id),
  });

  return (
    <div ref={containerRef}>
      <Stage>
        <NavRail
          label="Main"
          expanded={expanded}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => {
            setHovered(false);
            // Leaving the rail gives focus back to the page, like Right
            if (inRailRef.current) focus(lastPage.current);
          }}
          end={<NavItem icon={<SettingsIcon />} label="Settings" {...item('settings')} />}
        >
          <NavItem icon={<HomeIcon />} label="Home" {...item('home')} />
          <NavItem icon={<SearchIcon />} label="Search" {...item('search')} />
          <NavItem
            icon={<BellIcon />}
            label="Notifications"
            badge="3"
            badgeLabel="3 unread"
            {...item('notifications')}
          />
        </NavRail>
        <main style={{ padding: space.xl }}>
          <p style={pageText}>Route: {route}</p>
          <span style={{ marginRight: space.xs }}>
            <Button focused={isFocused('page:play')} onMouseMove={() => focus('page:play')}>
              Play
            </Button>
          </span>
          <Button focused={isFocused('page:info')} onMouseMove={() => focus('page:info')}>
            More info
          </Button>
        </main>
      </Stage>
    </div>
  );
}

/**
 * Left from the page enters the rail, which expands over the page; Up/Down move along it and
 * Confirm changes the route. Right or Back (Escape) from any item leaves the rail for the element
 * it was entered from, and the rail turns compact again.
 * The pointer expands the rail on entering it and gives focus back to the page on leaving it.
 */
export const HomeNavigation: Story = {
  render: () => <Home />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole('navigation', { name: 'Main' });

    await expect(nav).not.toHaveAttribute('data-expanded');
    await userEvent.keyboard('{ArrowLeft}');
    await expect(nav).toHaveAttribute('data-expanded');
    await expect(canvas.getByRole('button', { name: 'Home' })).toHaveAttribute('data-focused');
    await expect(canvas.getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    const notifications = canvas.getByRole('button', { name: 'Notifications' });
    await expect(notifications).toHaveAccessibleDescription('3 unread');
    await userEvent.keyboard('{Enter}');
    await expect(notifications).toHaveAttribute('aria-current', 'page');
    await expect(canvas.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');

    // Right from an item without a page neighbour leaves the rail too
    await userEvent.keyboard('{ArrowRight}');
    await expect(nav).not.toHaveAttribute('data-expanded');
    await expect(canvas.getByRole('button', { name: 'Play' })).toHaveAttribute('data-focused');

    // Back (Escape) leaves it as well, to the element the rail was entered from
    await userEvent.keyboard('{ArrowRight}{ArrowDown}');
    await expect(nav).toHaveAttribute('data-expanded');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Escape}');
    await expect(nav).not.toHaveAttribute('data-expanded');
    await expect(canvas.getByRole('button', { name: 'More info' })).toHaveAttribute('data-focused');

    // The pointer expands the rail on entering it and collapses it on leaving
    await userEvent.hover(nav);
    await expect(nav).toHaveAttribute('data-expanded');
    await userEvent.hover(canvas.getByRole('button', { name: 'Search' }));
    await expect(canvas.getByRole('button', { name: 'Search' })).toHaveAttribute('data-focused');
    await userEvent.unhover(nav);
    await expect(nav).not.toHaveAttribute('data-expanded');
    await expect(canvas.getByRole('button', { name: 'More info' })).toHaveAttribute('data-focused');
  },
};

/** Inner pages: the rail holds only Back, the on-screen counterpart of the remote's Back key. */
export const BackRail: Story = {
  render: () => (
    <Stage>
      <NavRail label="Page">
        <NavItem icon={<BackIcon />} label="Back" focused onClick={noop} />
      </NavRail>
    </Stage>
  ),
};
