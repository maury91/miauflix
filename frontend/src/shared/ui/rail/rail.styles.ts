import { PALETTE } from '@shared/config/constants';
import styled from 'styled-components';

/*
 * The whole rail is sized in ems of one font size, so it keeps its proportions on any screen:
 * collapsed it is exactly one square item plus an inset on each side, expanded it also fits the
 * longest label ("Notifications", 6.33em in Poppins 500). The font size is 90% of the Home row
 * titles' ("Continue watching"), so the labels read a step below them.
 */
const FONT_MIN_PX = 14.4;
const FONT_MAX_PX = 23.04;
const FONT_OF_HEIGHT = 0.0216;
/** Side of the square items. */
const ITEM_EM = 2.5;
/** Space between the items and the rail's edges. */
const INSET_EM = 0.5;
const ICON_EM = 1.25;
/** Icon padding inside an item, which centres the icon in the collapsed square. */
const ICON_PADDING_EM = (ITEM_EM - ICON_EM) / 2;
const LABEL_GAP_EM = 0.75;
const LABEL_EM = 6.5;
const COLLAPSED_EM = ITEM_EM + INSET_EM * 2;
const EXPANDED_EM =
  INSET_EM * 2 + ICON_PADDING_EM * 2 + ICON_EM + LABEL_GAP_EM + LABEL_EM + ICON_PADDING_EM;

export const RAIL_FONT_SIZE_CSS = `clamp(${FONT_MIN_PX}px, ${FONT_OF_HEIGHT * 100}vh, ${FONT_MAX_PX}px)`;
export const RAIL_COLLAPSED_WIDTH_CSS = `calc(${RAIL_FONT_SIZE_CSS} * ${COLLAPSED_EM})`;
export const RAIL_EXPANDED_WIDTH_CSS = `calc(${RAIL_FONT_SIZE_CSS} * ${EXPANDED_EM})`;

/** Collapsed rail width in pixels for a window height; matches `RAIL_COLLAPSED_WIDTH_CSS`. */
export function railCollapsedWidth(height: number): number {
  const fontSize = Math.min(FONT_MAX_PX, Math.max(FONT_MIN_PX, height * FONT_OF_HEIGHT));
  return fontSize * COLLAPSED_EM;
}

/** Navigation rail chrome shared by the Home sidebar and the back rail on inner pages. */
export const Rail = styled.aside<{ $active: boolean }>`
  position: fixed;
  inset: 0 auto 0 0;
  /* Same layer as the app logo and the intro: DOM order puts the rail over the logo and under the
     intro. */
  z-index: 1002;
  font-size: ${RAIL_FONT_SIZE_CSS};
  width: ${({ $active }) => ($active ? EXPANDED_EM : COLLAPSED_EM)}em;
  overflow: hidden;
  background: #0b0c10;
  /* A shadow, not a border, so the edge takes nothing from the items' width. */
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.06);
  transition: width 180ms ease;
`;

export const RailNavigation = styled.nav`
  position: absolute;
  top: 6vh;
  bottom: 3vh;
  left: ${INSET_EM}em;
  right: ${INSET_EM}em;
  display: flex;
  flex-direction: column;
  align-content: start;
  row-gap: 0.75em;
`;

export const RailItem = styled.button<{ $active: boolean; $selected: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: ${LABEL_GAP_EM}em;
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: ${ITEM_EM}em;
  padding: 0 ${ICON_PADDING_EM}em;
  border: 0;
  border-radius: 0.4em;
  background: ${({ $active, $selected }) =>
    $active && $selected ? 'linear-gradient(115deg, #e60019 0%, #870d1a 100%)' : 'transparent'};
  color: ${PALETTE.text.primary};
  font:
    500 1em 'Poppins',
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
  flex: 0 0 ${ICON_EM}em;
  width: ${ICON_EM}em;
  height: ${ICON_EM}em;
  place-items: center;
  color: currentColor;
  line-height: 1;

  > svg {
    display: block;
    width: 100%;
    height: 100%;
  }
`;
