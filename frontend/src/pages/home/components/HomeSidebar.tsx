import { PALETTE } from '@shared/config/constants';
import { type FC, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import type { HomeAction, NavigationOutcome } from '../homeNavigation';

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
  width: 100%;
  min-width: 44px;
  height: clamp(42px, 3.7vw, 62px);
  padding: 0 0.8vw;
  border: 0;
  border-radius: 0.5vw;
  background: ${({ $selected }) => ($selected ? 'rgba(255, 255, 255, 0.1)' : 'transparent')};
  color: ${PALETTE.text.primary};
  font:
    500 clamp(0.8rem, 1.8vw, 1.5rem) 'Poppins',
    sans-serif;
  text-align: left;
  cursor: pointer;
  outline: none;

  &:focus-visible {
    box-shadow: 0 0 0 2px ${PALETTE.text.primary};
  }

  &::before {
    content: '';
    position: absolute;
    top: 0.22rem;
    bottom: 0.22rem;
    left: -0.65vw;
    width: 0.28rem;
    border-radius: 0 0.22rem 0.22rem 0;
    background: ${PALETTE.color.brand};
    opacity: ${({ $active }) => ($active ? 1 : 0)};
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
`;

interface HomeSidebarProps {
  active: boolean;
  onAction: (action: HomeAction) => NavigationOutcome;
  onHover: () => void;
  onSettings: () => void;
}

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

  const handleItemKeyDown = (event: KeyboardEvent, item: 'home' | 'settings') => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next = item === 'home' ? settingsRef.current : homeRef.current;
      move(item === 'home' ? 'settings' : 'home');
      next?.focus({ preventScroll: true });
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = item === 'settings' ? homeRef.current : settingsRef.current;
      move(item === 'settings' ? 'home' : 'settings');
      next?.focus({ preventScroll: true });
    }
  };

  return (
    <Rail
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
          $active={active && selected === 'home'}
          $selected={selected === 'home'}
          aria-label="Home"
          aria-current="page"
          onKeyDown={event => handleItemKeyDown(event, 'home')}
          onFocus={() => move('home')}
          onMouseEnter={() => move('home')}
          onClick={() => onAction('confirm')}
        >
          <Icon aria-hidden="true">⌂</Icon>
          {active && <span>Home</span>}
        </Item>
        <Item
          ref={settingsRef}
          type="button"
          $active={active && selected === 'settings'}
          $selected={selected === 'settings'}
          aria-label="Settings"
          onKeyDown={event => handleItemKeyDown(event, 'settings')}
          onFocus={() => move('settings')}
          onMouseEnter={() => move('settings')}
          onClick={onSettings}
        >
          <Icon aria-hidden="true">⚙</Icon>
          {active && <span>Settings</span>}
        </Item>
      </Navigation>
    </Rail>
  );
};
