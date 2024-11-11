import styled from 'styled-components';
import { FC, useCallback, useEffect } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import MdiAdd from '~icons/mdi/add';
import { NEW_PROFILE_ITEM, PROFILE_ITEM_PREFIX } from '../consts';
import { createAvatar } from '@dicebear/core';
import { adventurer } from '@dicebear/collection';

export const PROFILE_SIZE = 12;
export const FOCUSED_PROFILE_SIZE = 16;

const PROFILE_SIZE_CSS = `${PROFILE_SIZE}vh`;
const FOCUSED_PROFILE_SIZE_CSS = `${FOCUSED_PROFILE_SIZE}vh`;

const StyledProfile = styled.div<{
  left: number;
  selected: boolean;
  src?: string;
  color?: string;
}>`
  position: fixed;
  top: 40vh;
  left: ${({ left }) => left}vw;
  transform: translateX(-50%);
  cursor: pointer;

  transition: left 0.4s;

  h2 {
    position: absolute;
    top: ${FOCUSED_PROFILE_SIZE_CSS};
    left: 50%;
    transform: translate(-50%, 2vh);
    opacity: ${({ selected }) => (selected ? 1 : 0)};
    font-size: 3.5vh;
    transition: opacity ${({ selected }) => (selected ? '0.4s 0.2s' : '0.2s')};
    width: 25vw;
    margin: 0;
    text-align: center;
  }

  div {
    position: relative;
    left: 0;
    top: 0;
    height: ${({ selected }) =>
      selected ? FOCUSED_PROFILE_SIZE_CSS : PROFILE_SIZE_CSS};
    width: ${({ selected }) =>
      selected ? FOCUSED_PROFILE_SIZE_CSS : PROFILE_SIZE_CSS};
    background: ${({ color, src }) => (src ? `url("${src}")` : '')};
    background-color: ${({ color, src }) => (color ? color : '')};
    border-radius: 5%;
    aspect-ratio: 1/1; // Not supported in Tizen
    overflow: hidden;
    transition: all 0.4s;
    color: #ddd;
  }
`;

export const Profile: FC<{
  name: string;
  color: string;
  index: number;
  left: number;
  onClick: (focusKey: string) => void;
  onSelect: (index: number) => void;
}> = ({ name, color, left, index, onClick, onSelect }) => {
  const { ref, focused, focusSelf, focusKey } = useFocusable({
    focusKey: `${PROFILE_ITEM_PREFIX}${index}`,
  });

  useEffect(() => {
    if (focused) {
      onSelect(index);
    }
  }, [focused, index, onSelect]);

  const onClickHandler = useCallback(() => {
    onClick(focusKey);
  }, [focusKey, onClick]);

  const createAvatarSvg = createAvatar(adventurer, {
    seed: name,
    backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
  });

  return (
    <StyledProfile
      left={left}
      selected={focused}
      src={createAvatarSvg.toDataUri()}
      ref={ref}
      onMouseEnter={() => focusSelf()}
      onClick={onClickHandler}
    >
      <h2>{name.split(' ')[0]}</h2>
      <div />
    </StyledProfile>
  );
};

export const NewProfile: FC<{
  color: string;
  index: number;
  left: number;
  onClick: (focusKey: string) => void;
  onSelect: (index: number) => void;
}> = ({ color, index, left, onClick, onSelect }) => {
  const { ref, focused, focusKey, focusSelf } = useFocusable({
    focusKey: NEW_PROFILE_ITEM,
  });

  useEffect(() => {
    if (focused) {
      onSelect(index);
    }
  }, [focused, index, onSelect]);

  const onClickHandler = useCallback(() => {
    onClick(focusKey);
  }, [focusKey, onClick]);

  return (
    <StyledProfile
      selected={focused}
      left={left}
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
