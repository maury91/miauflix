import { PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { type FC, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import type { HomeAction, NavigationOutcome } from '../homeNavigation';

import SettingsIcon from '~icons/mdi/cog-outline';
import HomeIcon from '~icons/mdi/home-outline';

const Rail = styled.aside<{ $active: boolean }>`
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 5;
  width: ${({ $active }) => ($active ? '15vw' : '5vw')};
  min-width: 56px;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.72));
  transition: width 180ms ease;

  &::after {
    content: '';
    position: absolute;
    inset: 0 -1vw 0 auto;
    width: 1vw;
    background: linear-gradient(90deg, rgba(0, 0, 0, 0.7), transparent);
    pointer-events: none;
  }
`;

const Navigation = styled.nav`
  position: absolute;
  top: 17vh;
  bottom: 6vh;
  left: 0.65vw;
  right: 0.65vw;
  display: grid;
  align-content: space-between;
`;

const Item = styled.button<{ $active: boolean; $selected: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.8vw;
  justify-content: ${({ $active }) => ($active ? 'flex-start' : 'center')};
  width: 100%;
  min-height: 0;
  min-width: 44px;
  height: clamp(42px, 3.7vw, 62px);
  padding: 0 0.8vw;
  border: 0;
  border-radius: clamp(8px, 0.5vw, 12px);
  background: ${({ $selected }) =>
    $selected ? 'linear-gradient(115deg, #e60019 0%, #870d1a 100%)' : 'transparent'};
  color: ${PALETTE.text.primary};
  font:
    500 clamp(0.8rem, 1.8vw, 1.5rem) 'Poppins',
    sans-serif;
  letter-spacing: 0;
  white-space: nowrap;
  text-align: left;
  cursor: pointer;
  outline: none;
  transition:
    background 140ms ease,
    box-shadow 140ms ease;

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px ${PALETTE.text.primary};
  }
`;

const Icon = styled.span`
  display: inline-grid;
  flex: 0 0 1.35em;
  width: 1.35em;
  height: 1.35em;
  place-items: center;
  color: currentColor;
  font-size: 1.05em;
  line-height: 1;

  > svg {
    display: block;
    width: 28px;
    height: 28px;
  }
`;

interface HomeSidebarProps {
  active: boolean;
  onAction: (action: HomeAction) => NavigationOutcome;
  onHover: () => void;
  onSettings: () => void;
}

/** Render Home and Settings actions, restoring the selected button’s focus when the sidebar becomes active. */
export const HomeSidebar: FC<HomeSidebarProps> = ({ active, onAction, onHover, onSettings }) => {
  const homeRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState<'home' | 'settings'>('home');

  useEffect(() => {
    if (active) {
      const target = selected === 'home' ? homeRef.current : settingsRef.current;
      target?.focus({ preventScroll: true });
    }
  }, [active, selected]);

  const move = (next: 'home' | 'settings') => {
    setSelected(next);
    onHover();
  };

  const navigationRef = useKeyboardNavigation({
    enabled: active,
    onDown: () => {
      const next = selected === 'home' ? 'settings' : 'home';
      move(next);
      (next === 'home' ? homeRef.current : settingsRef.current)?.focus({ preventScroll: true });
      return true;
    },
    onUp: () => {
      const next = selected === 'settings' ? 'home' : 'settings';
      move(next);
      (next === 'home' ? homeRef.current : settingsRef.current)?.focus({ preventScroll: true });
      return true;
    },
    onLeft: () => {
      const next = selected === 'settings' ? 'home' : 'settings';
      move(next);
      (next === 'home' ? homeRef.current : settingsRef.current)?.focus({ preventScroll: true });
      return true;
    },
    onRight: () => {
      onAction('right');
      return true;
    },
    onConfirm: () => {
      if (selected === 'settings') onSettings();
      else onAction('confirm');
      return true;
    },
    onBack: () => {
      onAction('back');
      return true;
    },
  });

  return (
    <Rail
      ref={navigationRef}
      $active={active}
      aria-label="Home navigation"
      onMouseEnter={onHover}
      onMouseLeave={() => {
        if (active) onAction('right');
      }}
    >
      <Navigation>
        <Item
          ref={homeRef}
          type="button"
          $active={active}
          $selected={selected === 'home'}
          aria-label="Home"
          aria-current="page"
          onFocus={() => move('home')}
          onMouseEnter={() => move('home')}
          onClick={() => onAction('confirm')}
        >
          <Icon aria-hidden="true">
            <HomeIcon />
          </Icon>
          {active && <span>Home</span>}
        </Item>
        <Item
          ref={settingsRef}
          type="button"
          $active={active}
          $selected={selected === 'settings'}
          aria-label="Settings"
          onFocus={() => move('settings')}
          onMouseEnter={() => move('settings')}
          onClick={onSettings}
        >
          <Icon aria-hidden="true">
            <SettingsIcon />
          </Icon>
          {active && <span>Settings</span>}
        </Item>
      </Navigation>
    </Rail>
  );
};
