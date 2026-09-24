import { PALETTE } from '@shared/config/constants';
import { type FC, useEffect, useRef } from 'react';
import styled from 'styled-components';

import type { HomeAction, NavigationOutcome } from '../homeNavigation';

const Rail = styled.aside<{ $active: boolean }>`
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 5;
  width: ${({ $active }) => ($active ? '15vw' : '5vw')};
  min-width: 56px;
  background: rgba(0, 0, 0, 0.78);
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

const Item = styled.button<{ $active: boolean }>`
  position: absolute;
  top: 50%;
  left: 1vw;
  display: flex;
  align-items: center;
  gap: 0.8vw;
  width: 13vw;
  min-width: 44px;
  height: 3vw;
  transform: translateY(-50%);
  border: 0;
  border-radius: 0.5vw;
  background: ${({ $active }) => ($active ? 'rgba(255, 255, 255, 0.1)' : 'transparent')};
  color: ${PALETTE.text.primary};
  font:
    500 clamp(0.8rem, 1.8vw, 1.5rem) 'Poppins',
    sans-serif;
  text-align: left;
  cursor: pointer;
  outline: none;
  padding: 0 1vw;
`;

const Icon = styled.span`
  display: inline-grid;
  width: 1.1em;
  height: 1.1em;
  place-items: center;
  border: 0.15em solid currentColor;
  border-radius: 0.2em;
  font-size: 0.7em;
`;

interface HomeSidebarProps {
  active: boolean;
  onAction: (action: HomeAction) => NavigationOutcome;
  onHover: () => void;
}

export const HomeSidebar: FC<HomeSidebarProps> = ({ active, onAction, onHover }) => {
  const itemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) itemRef.current?.focus({ preventScroll: true });
  }, [active]);

  return (
    <Rail $active={active} aria-label="Home navigation" onMouseEnter={onHover}>
      <Item
        ref={itemRef}
        type="button"
        $active={active}
        aria-current={active ? 'page' : undefined}
        onMouseEnter={onHover}
        onClick={() => onAction('confirm')}
      >
        <Icon>⌂</Icon>
        {active && <span>Browse</span>}
      </Item>
    </Rail>
  );
};
