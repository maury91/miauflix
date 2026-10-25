import { PALETTE } from '@shared/config/constants';
import styled from 'styled-components';

/** Navigation rail chrome shared by the Home sidebar and the back rail on inner pages. */
export const Rail = styled.aside<{ $active: boolean }>`
  position: fixed;
  inset: 0 auto 0 0;
  /* Same layer as the app logo and the intro: DOM order puts the rail over the logo and under the
     intro. */
  z-index: 1002;
  width: ${({ $active }) => ($active ? '15vw' : '5vw')};
  min-width: 56px;
  background: #0b0c10;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  transition: width 180ms ease;
`;

export const RailNavigation = styled.nav`
  position: absolute;
  top: 6vh;
  left: 0.65vw;
  right: 0.65vw;
  display: grid;
  align-content: start;
  row-gap: 2vh;
`;

export const RailItem = styled.button<{ $active: boolean; $selected: boolean }>`
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

export const RailIcon = styled.span`
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
