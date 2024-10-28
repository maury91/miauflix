import { useGetUsersQuery } from '../../../store/api/users';
import { useCallback, useEffect } from 'react';
import { H1 } from './components/various';
import { builtForTizen } from '../../../consts';
import {
  FocusContext,
  getCurrentFocusKey,
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { NewProfile, Profile } from './components/profile';
import { Settings } from './components/settings';
import {
  colors,
  NEW_PROFILE_ITEM,
  PROFILE_ITEM_PREFIX,
  SETTINGS_ITEM,
} from './consts';
import { useAppDispatch } from '../../../store/store';
import { chooseProfile } from '../../../store/slices/app';
import styled from 'styled-components';
import { motion } from 'framer-motion';

export const ProfileSelectionContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  padding-top: 16vh;
  left: 0;
  width: 25vw;
  bottom: 0;
`;

export const ProfileSelection = () => {
  const { data: users } = useGetUsersQuery();
  const dispatch = useAppDispatch();
  const { focusKey } = useFocusable();
  const hasProfiles = users && users.length > 0;

  const openProfile = useCallback(
    (profileIndex: number) => {
      if (users) {
        dispatch(chooseProfile(users[profileIndex].slug));
      }
    },
    [users]
  );

  const openNewProfile = useCallback(() => {
    console.log('ToDo');
  }, []);

  const openSettings = useCallback(() => {
    console.log('ToDo');
  }, []);

  useEffect(() => {
    setFocus(hasProfiles ? `${PROFILE_ITEM_PREFIX}0` : NEW_PROFILE_ITEM);
  }, [hasProfiles]);

  useEffect(() => {
    const listener = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        const key = getCurrentFocusKey();
        if (key === NEW_PROFILE_ITEM) {
          openNewProfile();
        }
        if (key === SETTINGS_ITEM) {
          openSettings();
        }
        if (key.startsWith(PROFILE_ITEM_PREFIX)) {
          openProfile(parseInt(key.substring(PROFILE_ITEM_PREFIX.length)));
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
          onClick={() => openProfile(index)}
        />
      ))}
      <NewProfile
        index={users?.length ?? 0}
        color="white"
        onClick={() => openNewProfile()}
      />
      {!builtForTizen && <Settings />}
    </FocusContext.Provider>
  );
};
