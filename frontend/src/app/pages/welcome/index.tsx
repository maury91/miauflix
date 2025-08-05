import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { useEffect, useState } from 'react';

import { useAppSelector } from '../../../store/store';
import { FullScreenDiv } from '../../components/fullScreenDiv';
import { NEW_PROFILE_ITEM, PROFILE_ITEM_PREFIX } from './consts';
import { NewProfileScreen } from './screens/newProfileScreen';
import { ProfileSelectionScreen } from './screens/profileSelectionScreen';

export const ProfileSelection = () => {
  const screen = useAppSelector(state => state.profileSelection.screen);
  const [lastScreen, setLastScreen] = useState(screen);

  // FixMe: Refactor to use users state
  // For now, we'll use an empty array since users are managed through auth flow
  // In the future, this could come from auth state or local storage
  const users: any[] = [];

  const { focusKey } = useFocusable({
    saveLastFocusedChild: true,
  });

  useEffect(() => {
    setFocus(users?.length ? `${PROFILE_ITEM_PREFIX}0` : NEW_PROFILE_ITEM);
  }, [users]);

  useEffect(() => {
    if (lastScreen !== screen && lastScreen === 'new-profile') {
      setFocus(NEW_PROFILE_ITEM);
    }
    setLastScreen(screen);
  }, [lastScreen, screen]);

  return (
    <FullScreenDiv
      key="profile-selection"
      initial={{ x: '-120%' }}
      animate={{ x: '0' }}
      exit={{ x: '-120%' }}
    >
      <FocusContext.Provider value={focusKey}>
        <MotionConfig transition={{ duration: 0.3 }}>
          <AnimatePresence initial={false} mode="wait">
            {screen === 'new-profile' && <NewProfileScreen />}
            {screen === 'profile-selection' && <ProfileSelectionScreen users={users} />}
          </AnimatePresence>
        </MotionConfig>
      </FocusContext.Provider>
    </FullScreenDiv>
  );
};
