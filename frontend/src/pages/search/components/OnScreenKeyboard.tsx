import { PALETTE } from '@shared/config/constants';
import type { FC } from 'react';
import styled from 'styled-components';

import {
  KEYBOARD_ACTION_SPAN,
  KEYBOARD_BACKSPACE,
  KEYBOARD_CHARACTERS,
  KEYBOARD_COLUMNS,
  KEYBOARD_SPACE,
} from '../searchNavigation';
import { focusRing } from './search.styles';

import BackspaceIcon from '~icons/mdi/backspace';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(${KEYBOARD_COLUMNS}, 1fr);
  gap: 0.45vw;
`;

const Key = styled.button<{ $focused: boolean; $wide?: boolean }>`
  ${focusRing};
  grid-column: span ${({ $wide }) => ($wide ? KEYBOARD_ACTION_SPAN : 1)};
  display: grid;
  place-items: center;
  height: 6.6vh;
  padding: 0;
  border: 0;
  border-radius: 0.5vw;
  color: ${PALETTE.text.primary};
  font:
    500 1.45vw 'Poppins',
    sans-serif;
  cursor: pointer;

  > svg {
    width: 1.9vw;
    height: 1.9vw;
  }
`;

const SpaceBar = styled.span`
  display: block;
  width: 45%;
  height: 0.35vh;
  margin-top: 1.2vh;
  border-radius: 1px;
  background: currentColor;
`;

interface OnScreenKeyboardProps {
  focusedIndex: number | null;
  onPress: (index: number) => void;
  onFocusKey: (index: number) => void;
  registerKey: (index: number, element: HTMLButtonElement | null) => void;
}

/** A–Z / 0–9 grid with backspace and space keys for remote-control typing. */
export const OnScreenKeyboard: FC<OnScreenKeyboardProps> = ({
  focusedIndex,
  onPress,
  onFocusKey,
  registerKey,
}) => {
  const key = (index: number, label: string, content: React.ReactNode, wide = false) => (
    <Key
      key={index}
      ref={element => registerKey(index, element)}
      type="button"
      tabIndex={focusedIndex === index ? 0 : -1}
      aria-label={label}
      $focused={focusedIndex === index}
      $wide={wide}
      onFocus={() => onFocusKey(index)}
      onMouseEnter={() => onFocusKey(index)}
      onClick={() => onPress(index)}
    >
      {content}
    </Key>
  );
  return (
    <Grid role="group" aria-label="On-screen keyboard">
      {KEYBOARD_CHARACTERS.map((character, index) => key(index, character, character))}
      {key(KEYBOARD_BACKSPACE, 'Delete', <BackspaceIcon aria-hidden="true" />, true)}
      {key(KEYBOARD_SPACE, 'Space', <SpaceBar aria-hidden="true" />, true)}
    </Grid>
  );
};
