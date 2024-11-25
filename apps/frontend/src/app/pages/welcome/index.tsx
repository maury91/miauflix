import { useCallback, useEffect, useState } from 'react';
import {
  FocusContext,
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { NEW_PROFILE_ITEM, PROFILE_ITEM_PREFIX } from './consts';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { useProfileSelectionNavigation } from './hooks/useProfileSelectionNavigation';
import { useGetUsersQuery } from '../../../store/api/users';
import { useNavigation } from '../../hooks/useNavigation';
import { ProfileSelectionScreen } from './screens/profileSelectionScreen';
import { NewProfileScreen } from './screens/newProfileScreen';
import { FullScreenDiv } from '../../components/fullScreenDiv';

export const ProfileSelection = () => {
  const [newProfileOpen, setNewProfileOpen] = useState(false);
  const { data: users } = useGetUsersQuery();
  const { focusKey } = useFocusable({
    saveLastFocusedChild: true,
  });

  const closeNewProfile = useCallback(() => {
    setNewProfileOpen(false);
  }, []);

  useEffect(() => {
    setFocus(users?.length ? `${PROFILE_ITEM_PREFIX}0` : NEW_PROFILE_ITEM);
  }, [users]);

  useNavigation({
    page: 'profile-selection',
    onBack: () => {
      setNewProfileOpen(false);
      setFocus(NEW_PROFILE_ITEM);
    },
  });

  const openNewProfile = useCallback(() => {
    setNewProfileOpen(true);
  }, []);

  const navigateTo = useProfileSelectionNavigation({
    openNewProfile,
  });

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
            {newProfileOpen ? (
              <NewProfileScreen onClose={closeNewProfile} />
            ) : (
              <ProfileSelectionScreen navigateTo={navigateTo} users={users} />
            )}
          </AnimatePresence>
        </MotionConfig>
      </FocusContext.Provider>
    </FullScreenDiv>
  );
};
