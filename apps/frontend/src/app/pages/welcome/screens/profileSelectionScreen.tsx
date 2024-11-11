import styled from 'styled-components';
import { FC } from 'react';
import { ProfileSlider, ProfileSliderProps } from '../components/profileSlider';
import { builtForTizen } from '../../../../consts';
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
export const ProfileSelectionScreen: FC<ProfileSliderProps> = ({
  navigateTo,
  users,
}) => {
  return (
    <FullScreenDiv
      key="profile-selection"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <ProfileSelectionTitle>Who's watching?</ProfileSelectionTitle>
      <ProfileSlider navigateTo={navigateTo} users={users} />
      {!builtForTizen && <Settings />}
    </FullScreenDiv>
  );
};
