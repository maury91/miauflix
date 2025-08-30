import { adventurer } from '@dicebear/collection';
import { createAvatar } from '@dicebear/core';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';

import MdiAdd from '~icons/mdi/add';

import { NEW_PROFILE_ITEM, PROFILE_ITEM_PREFIX } from '../consts';

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
    height: ${({ selected }) => (selected ? FOCUSED_PROFILE_SIZE_CSS : PROFILE_SIZE_CSS)};
    width: ${({ selected }) => (selected ? FOCUSED_PROFILE_SIZE_CSS : PROFILE_SIZE_CSS)};
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
  index: number;
  left: number;
  onOpen: (index: number) => void;
  onSelect: (index: number) => void;
}> = ({ name, left, index, onOpen, onSelect }) => {
  // FixMe: Refactor to be a useAvatar hook
  const [avatarSrc, setAvatarSrc] = useState<string>('');

  const openProfile = useCallback(() => {
    onOpen(index);
  }, [index, onOpen]);

  const { ref, focused, focusSelf } = useFocusable({
    focusKey: `${PROFILE_ITEM_PREFIX}${index}`,
    onEnterPress: openProfile,
  });

  useEffect(() => {
    if (focused) {
      onSelect(index);
    }
  }, [focused, index, onSelect]);

  useEffect(() => {
    const createAvatarSvg = createAvatar(adventurer, {
      seed: name,
      backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
    });

    setAvatarSrc(createAvatarSvg.toDataUri());
  }, [name]);

  return (
    <StyledProfile
      left={left}
      selected={focused}
      src={avatarSrc}
      ref={ref}
      onMouseEnter={() => focusSelf()}
      onClick={openProfile}
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
  onOpen: () => void;
  onSelect: (index: number) => void;
}> = ({ color, index, left, onOpen, onSelect }) => {
  const openNewProfile = useCallback(() => {
    onOpen();
  }, [onOpen]);

  const { ref, focused, focusSelf } = useFocusable({
    focusKey: NEW_PROFILE_ITEM,
    onEnterPress: openNewProfile,
  });

  useEffect(() => {
    if (focused) {
      onSelect(index);
    }
  }, [focused, index, onSelect]);

  return (
    <StyledProfile
      selected={focused}
      left={left}
      color={color}
      ref={ref}
      onMouseEnter={() => focusSelf()}
      onClick={openNewProfile}
    >
      <div>
        <MdiAdd width="100%" height="100%" color="black" />
      </div>
      <h2>New Profile</h2>
    </StyledProfile>
  );
};
