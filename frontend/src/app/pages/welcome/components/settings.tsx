import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { FC } from 'react';
import styled from 'styled-components';

import { SettingsIcon } from '../../../ui-elements/icons/settings.icon';
import { SETTINGS_ITEM } from '../consts';

export const StyledSettings = styled.div<{
  selected: boolean;
}>`
  flex-direction: row;
  align-items: center;
  position: fixed;
  bottom: 4vh;
  left: 2vw;
  transform: translate3d(${({ selected }) => (selected ? 2 : 0)}vw, 0, 0);
  cursor: pointer;

  transition: transform 0.4s;

  svg {
    position: relative;
    left: 0;
    top: 0;
    height: ${({ selected }) => (selected ? '6vh' : '4vh')};
    width: ${({ selected }) => (selected ? '6vh' : '4vh')};
    aspect-ratio: 1/1; // Not supported in Tizen

    transition: all 0.4s;
    transform: scale3d(1.28, 1.28, 1);
  }

  h2 {
    position: absolute;
    left: 5vh;
    top: 50%;
    transform: translate3d(${({ selected }) => (selected ? 2 : 0)}vw, -50%, 0);
    opacity: ${({ selected }) => (selected ? 1 : 0)};
    font-size: 3vh;
    transition: all 0.4s;
    width: 25vw;
    margin: 0;
  }
`;
export const Settings: FC = () => {
  const { ref, focused, focusSelf } = useFocusable({
    focusKey: SETTINGS_ITEM,
  });
  return (
    <StyledSettings selected={focused} ref={ref} onMouseEnter={() => focusSelf()}>
      <SettingsIcon size="100%" color="white" />
      <h2>Settings</h2>
    </StyledSettings>
  );
};
