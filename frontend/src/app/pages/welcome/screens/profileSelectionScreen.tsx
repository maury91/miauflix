import type { FC } from 'react';
import styled from 'styled-components';

import { builtForTizen } from '@/consts';

import { FullScreenDiv } from '../../../components/fullScreenDiv';
import type { ProfileSliderProps } from '../components/profileSlider';
import { ProfileSlider } from '../components/profileSlider';
import { Settings } from '../components/settings';

const ProfileSelectionTitle = styled.h1`
  position: fixed;
  left: 10vw;
  right: 10vw;
  top: 25vh;
  font-weight: 500;
  font-size: 3.5vh;
  text-align: center;
`;
export const ProfileSelectionScreen: FC<ProfileSliderProps> = ({ users }) => {
  return (
    <FullScreenDiv
      key="profile-selection"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <ProfileSelectionTitle>Who's watching?</ProfileSelectionTitle>
      <ProfileSlider users={users} />
      {!builtForTizen && <Settings />}
    </FullScreenDiv>
  );
};
