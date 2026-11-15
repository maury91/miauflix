import { PALETTE } from '@shared/config/constants';
import { Button as BaseButton } from '@shared/ui/button/Button';
import styled from 'styled-components';

/** Styles the details page and its episode pane share. */

export const SectionLabel = styled.h2`
  margin: 3vh 0 1vh;
  font-size: clamp(16px, 2.5vh, 23.2px);
  font-weight: 500;
`;

export const ErrorState = styled.div`
  padding: 3vh 0;
  color: ${PALETTE.text.secondary};
`;

// eslint-disable-next-line no-restricted-syntax -- Existing media/player interaction and TV-scaled chrome; see shared/ui/README.md.
export const PrimaryAction = styled(BaseButton)<{ $selected: boolean }>`
  min-width: 0;
  min-height: 5vh;
  padding: 1vh 1.6vw;
  border: 0.25vh solid
    ${({ $selected }) => ($selected ? PALETTE.color.interactive : PALETTE.background.border)};
  border-radius: 0.7vh;
  background: ${({ $selected }) =>
    $selected ? PALETTE.color.interactive : PALETTE.background.surface2};
  color: ${PALETTE.text.primary};
  font:
    600 clamp(14.4px, 2.1vh, 19.2px) 'Poppins',
    sans-serif;
  cursor: pointer;
  box-shadow: none;
`;
