import { useGetUsersQuery } from '../../../store/api/users';
import { useEffect } from 'react';
import { H1, ProfileSelectorContainer } from './components/various';
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

export const ProfileSelection = () => {
  const { data: users } = useGetUsersQuery();
  const dispatch = useAppDispatch();
  const { ref, focusKey } = useFocusable();
  const hasProfiles = users && users.length > 0;

  useEffect(() => {
    setFocus(hasProfiles ? 'profile-0' : 'profile-new');
  }, [hasProfiles]);

  useEffect(() => {
    const listener = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        const key = getCurrentFocusKey();
        console.log(key, users, parseInt(key.split('-')[1]));
        if (key.startsWith('profile-') && users) {
          const profileIndex = parseInt(key.split('-')[1]);
          dispatch(chooseProfile(users[profileIndex].slug));
        }
        console.log(getCurrentFocusKey());
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [dispatch, users]);

  return (
    <FocusContext.Provider value={focusKey}>
      <ProfileSelectorContainer ref={ref}>
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
      </ProfileSelectorContainer>
    </FocusContext.Provider>
  );
};
