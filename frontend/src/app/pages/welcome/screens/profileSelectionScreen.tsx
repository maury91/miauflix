import styled from 'styled-components';
import { FC } from 'react';
import { ProfileSlider, ProfileSliderProps } from '../components/profileSlider';
import { builtForTizen, IS_TV } from '../../../../consts';
import { Settings } from '../components/settings';
import { FullScreenDiv } from '../../../components/fullScreenDiv';

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
