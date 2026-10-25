import { PALETTE } from '@shared/config/constants';
import styled, { css } from 'styled-components';

/** Shared focus treatment: a white ring like the mockup's focused key and card. */
export const focusRing = css<{ $focused: boolean }>`
  outline: none;
  box-shadow: ${({ $focused }) => ($focused ? '0 0 0 0.16vw #fff' : 'none')};
  background: ${({ $focused }) =>
    $focused ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.06)'};

  &:focus-visible {
    box-shadow: 0 0 0 0.16vw #fff;
  }
`;

export const SectionTitle = styled.h2`
  margin: 0 0 1.4vh;
  color: ${PALETTE.text.primary};
  font:
    600 1.45vw 'Poppins',
    sans-serif;
  letter-spacing: 0;
  text-transform: none;
`;
