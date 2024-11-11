import { useGetUsersQuery } from '../../../../store/api/users';
import { useAppDispatch } from '../../../../store/store';
import { useCallback } from 'react';
import { chooseProfile } from '../../../../store/slices/app';
import {
  NEW_PROFILE_ITEM,
  PROFILE_ITEM_PREFIX,
  SETTINGS_ITEM,
} from '../consts';
import { getCurrentFocusKey } from '@noriginmedia/norigin-spatial-navigation';
import { useNavigation } from '../../../hooks/useNavigation';

interface UseProfileSelectionNavigationProps {
  openNewProfile: () => void;
}

export const useProfileSelectionNavigation = ({
  openNewProfile,
}: UseProfileSelectionNavigationProps) => {
  const { data: users } = useGetUsersQuery();
  const dispatch = useAppDispatch();

  const openProfile = useCallback(
    (profileIndex: number) => {
      if (users) {
        dispatch(
          chooseProfile({
            id: users[profileIndex].id,
            slug: users[profileIndex].slug,
          })
        );
      }
    },
    [dispatch, users]
  );

  const openSettings = useCallback(() => {
    console.log('ToDo');
  }, []);

  const navigateTo = useCallback(
    (key: string) => {
      if (key === NEW_PROFILE_ITEM) {
        openNewProfile();
      }
      if (key === SETTINGS_ITEM) {
        openSettings();
      }
      if (key.startsWith(PROFILE_ITEM_PREFIX)) {
        openProfile(parseInt(key.substring(PROFILE_ITEM_PREFIX.length)));
      }
    },
    [openNewProfile, openProfile, openSettings]
  );

  const onEnterPress = useCallback(() => {
    const key = getCurrentFocusKey();
    navigateTo(key);
  }, [navigateTo]);

  useNavigation({
    page: 'profile-selection',
    onEnter: onEnterPress,
  });

  return navigateTo;
};
