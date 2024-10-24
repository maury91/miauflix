import { useGetUsersQuery } from '../../../store/api/users';
import { useEffect } from 'react';
import { H1 } from './components/various';
import { runningInTizen } from '../../../consts';
import {
  FocusContext,
  getCurrentFocusKey,
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { NewProfile, Profile } from './components/profile';
import { Settings } from './components/settings';
import { colors } from './consts';
import { useAppDispatch } from '../../../store/store';
import { chooseProfile } from '../../../store/slices/app';
import styled from 'styled-components';
import { motion } from 'framer-motion';

export const ProfileSelectionContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  padding-top: 13vh;
  left: 0;
  width: 40vh;
  bottom: 0;
`;

export const ProfileSelection = () => {
  const { data: users } = useGetUsersQuery();
  const dispatch = useAppDispatch();
  const { focusKey } = useFocusable();
  const hasProfiles = users && users.length > 0;

  useEffect(() => {
    setFocus(hasProfiles ? 'profile-0' : 'profile-new');
  }, [hasProfiles]);

  useEffect(() => {
    const listener = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        const key = getCurrentFocusKey();
        if (key.startsWith('profile-') && users) {
          const profileIndex = parseInt(key.split('-')[1]);
          dispatch(chooseProfile(users[profileIndex].slug));
        }
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [dispatch, users]);

  return (
    <FocusContext.Provider value={focusKey}>
      <H1>Who's watching?</H1>
      {users?.map(({ name }, index) => (
        <Profile
          key={index}
          index={index}
          name={name.split(' ')[0]}
          color={colors[index % colors.length]}
        />
      ))}
      <NewProfile index={users?.length ?? 0} color="white" />
      {!runningInTizen && <Settings />}
    </FocusContext.Provider>
  );
};
