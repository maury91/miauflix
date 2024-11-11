import styled from 'styled-components';
import { FC, useCallback } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import MdiAdd from '~icons/mdi/add';
import { NEW_PROFILE_ITEM, PROFILE_ITEM_PREFIX } from '../consts';
import { createAvatar } from '@dicebear/core';
import { adventurerNeutral } from '@dicebear/collection';

const StyledProfile = styled.div<{
  index: number;
  selected: boolean;
  src?: string;
  color?: string;
}>`
  position: fixed;
  top: ${({ index }) => 35 + index * 15}vh;
  left: 2vw;
  transform: translate3d(${({ selected }) => (selected ? 2 : 0)}vw, 0, 0);
  cursor: pointer;

  transition: transform 0.4s;

  h2 {
    position: absolute;
    left: min(8vh, 8vw);
    top: 50%;
    transform: translate3d(${({ selected }) => (selected ? 2 : 0)}vw, -50%, 0);
    opacity: ${({ selected }) => (selected ? 1 : 0)};
    font-size: min(3.5vh, 3.5vw);
    transition: all 0.4s;
    width: 25vw;
    margin: 0;
  }

  div {
    position: relative;
    left: 0;
    top: 0;
    height: min(
      ${({ selected }) => (selected ? '7.6vh, 7.6vw' : '5.6vh, 5.6vw')}
    );
    width: min(
      ${({ selected }) => (selected ? '7.6vh, 7.6vw' : '5.6vh, 5.6vw')}
    );
    background: ${({ color, src }) =>
      src ? `url("${src}")` : color ? color : 'white'};
    border-radius: 5%;
    aspect-ratio: 1/1; // Not supported in Tizen
    overflow: hidden;
    transition: all 0.4s;
    color: #ddd;
    margin-right: min(2vh, 2vw);
  }
`;

export const Profile: FC<{
  name: string;
  color: string;
  index: number;
  onClick: (focusKey: string) => void;
}> = ({ name, color, index, onClick }) => {
  const { ref, focused, focusSelf, focusKey } = useFocusable({
    focusKey: `${PROFILE_ITEM_PREFIX}${index}`,
  });

  const onClickHandler = useCallback(() => {
    onClick(focusKey);
  }, [focusKey, onClick]);

  const createAvatarSvg = createAvatar(adventurerNeutral, {
    seed: name,
  });

  return (
    <StyledProfile
      index={index}
      selected={focused}
      src={createAvatarSvg.toDataUri()}
      ref={ref}
      onMouseEnter={() => focusSelf()}
      onClick={onClickHandler}
    >
      <h2>{focused && name.split(' ')[0]}</h2>
      <div />
    </StyledProfile>
  );
};

export const NewProfile: FC<{
  color: string;
  index: number;
  onClick: (focusKey: string) => void;
}> = ({ color, index, onClick }) => {
  const { ref, focused, focusKey, focusSelf } = useFocusable({
    focusKey: NEW_PROFILE_ITEM,
  });

  const onClickHandler = useCallback(() => {
    onClick(focusKey);
  }, [focusKey, onClick]);

  return (
    <StyledProfile
      index={index}
      selected={focused}
      color={color}
      ref={ref}
      onMouseEnter={() => focusSelf()}
      onClick={onClickHandler}
    >
      <div>
        <MdiAdd width="100%" height="100%" color="black" />
      </div>
      <h2>New Profile</h2>
    </StyledProfile>
  );
};
