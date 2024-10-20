import styled from 'styled-components';
import { FC } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { UserCircleIcon } from '../../../ui-elements/icons/user_circle.icon';
import { AddIcon } from '../../../ui-elements/icons/add.icon';

const StyledProfile = styled.div<{
  index: number;
  selected: boolean;
  color: string;
}>`
  flex-direction: row;
  align-items: center;
  position: fixed;
  top: ${({ index }) => 35 + index * 15}vh;
  left: 3vh;
  transform: translate3d(${({ selected }) => (selected ? 3 : 0)}vh, 0, 0);

  transition: transform 0.4s;

  div {
    position: relative;
    left: 0;
    top: 0;
    height: ${({ selected }) => (selected ? 8 : 6)}vh;
    width: ${({ selected }) => (selected ? 8 : 6)}vh;
    background: ${({ color }) => color};
    border-radius: 100%;
    aspect-ratio: 1/1; // Not supported in Tizen

    transition: all 0.4s;

    svg {
      transform: scale3d(1.28, 1.28, 1);
      fill: #333;
    }
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

export const Profile: FC<{
  name: string;
  color: string;
  index: number;
}> = ({ name, color, index }) => {
  const { ref, focused } = useFocusable({
    focusKey: `profile-${index}`,
  });
  return (
    <StyledProfile index={index} selected={focused} color={color} ref={ref}>
      <div>
        <UserCircleIcon size="100%" />
      </div>
      <h2>{name}</h2>
    </StyledProfile>
  );
};

export const NewProfile: FC<{
  color: string;
  index: number;
}> = ({ color, index }) => {
  const { ref, focused } = useFocusable({
    focusKey: 'profile-new',
  });
  return (
    <StyledProfile index={index} selected={focused} color={color} ref={ref}>
      <div>
        <AddIcon size="100%" />
      </div>
      <h2>New Profile</h2>
    </StyledProfile>
  );
};
