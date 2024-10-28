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
  left: 3vh;
  transform: translate3d(${({ selected }) => (selected ? 3 : 0)}vh, 0, 0);
  cursor: pointer;

  transition: transform 0.4s;

  svg {
    position: relative;
    left: 0;
    top: 0;
    height: 6vh;
    width: 6vh;
    aspect-ratio: 1/1; // Not supported in Tizen

    transition: all 0.4s;
    transform: scale3d(1.28, 1.28, 1);
  }

  h2 {
    position: absolute;
    left: 8vh;
    top: 50%;
    transform: translate3d(${({ selected }) => (selected ? 3 : 0)}vh, -50%, 0);
    opacity: ${({ selected }) => (selected ? 1 : 0)};
    font-size: 3vh;
    transition: all 0.4s;
    width: 25vh;
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
