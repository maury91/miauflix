import { useGetUsersQuery } from '../../../store/api/users';
import { useEffect } from 'react';
import { builtForTizen } from '../../../consts';
import {
  FocusContext,
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { NewProfile, Profile } from './components/profile';
import { Settings } from './components/settings';
import { colors, NEW_PROFILE_ITEM, PROFILE_ITEM_PREFIX } from './consts';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { useProfileSelectionNavigation } from './hooks/useProfileSelectionNavigation';

export const ProfileSelectionContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  padding-top: 16vh;
  left: 0;
  width: 30vw;
  bottom: 0;
`;

const ProfileSelectionTitle = styled.h1`
  font-size: min(2.8vw, 3.5vh);
  text-align: center;
`;

export const ProfileSelection = () => {
  const { data: users } = useGetUsersQuery();
  const { focusKey } = useFocusable();
  const navigateTo = useProfileSelectionNavigation();

  const hasProfiles = users && users.length > 0;

  useEffect(() => {
    setFocus(hasProfiles ? `${PROFILE_ITEM_PREFIX}0` : NEW_PROFILE_ITEM);
  }, [hasProfiles]);

  return (
    <FocusContext.Provider value={focusKey}>
      <ProfileSelectionTitle>Who's watching?</ProfileSelectionTitle>
      {users?.map(({ name }, index) => (
        <Profile
          key={index}
          index={index}
          name={name}
          color={colors[index % colors.length]}
          onClick={navigateTo}
        />
      ))}
      <NewProfile
        index={users?.length ?? 0}
        color="white"
        onClick={navigateTo}
      />
      {!builtForTizen && <Settings />}
    </FocusContext.Provider>
  );
};
