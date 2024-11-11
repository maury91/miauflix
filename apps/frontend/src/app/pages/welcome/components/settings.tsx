import { FC } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { SettingsIcon } from '../../../ui-elements/icons/settings.icon';
import styled from 'styled-components';
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
    height: min(${({ selected }) => (selected ? '6vh, 6vw' : '4vh, 4vw')});
    width: min(${({ selected }) => (selected ? '6vh, 6vw' : '4vh, 4vw')});
    aspect-ratio: 1/1; // Not supported in Tizen

    transition: all 0.4s;
    transform: scale3d(1.28, 1.28, 1);
  }

  h2 {
    position: absolute;
    left: min(5vh, 5vw);
    top: 50%;
    transform: translate3d(${({ selected }) => (selected ? 2 : 0)}vw, -50%, 0);
    opacity: ${({ selected }) => (selected ? 1 : 0)};
    font-size: min(3vh, 3vw);
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
    <StyledSettings
      selected={focused}
      ref={ref}
      onMouseEnter={() => focusSelf()}
    >
      <SettingsIcon size="100%" color="white" />
      <h2>Settings</h2>
    </StyledSettings>
  );
};
