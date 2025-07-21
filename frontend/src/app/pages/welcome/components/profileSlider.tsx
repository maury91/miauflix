import { FC, useCallback, useState } from 'react';
import { UserDto } from '@miauflix/backend-client';
import { useProfilesPosition } from '../hooks/useProfilesPosition';
import { NewProfile, Profile } from './profile';
import { useAppDispatch } from '@store/store';
import { chooseProfile } from '@store/slices/app';
import { navigateToNewProfile } from '@store/slices/profileSelection';

export interface ProfileSliderProps {
  users: UserDto[];
}

export const ProfileSlider: FC<ProfileSliderProps> = ({ users }) => {
  const dispatch = useAppDispatch();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const positions = useProfilesPosition(users.length, selectedIndex);

  const onProfileSelect = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const onProfileOpen = useCallback(
    (index: number) => {
      // For now, just select the profile
      // In the future, this could open a profile details screen
      dispatch(
        chooseProfile({
          id: index,
          slug: `profile-${index}`,
        })
      );
    },
    [dispatch]
  );

  const onNewProfileOpen = useCallback(() => {
    dispatch(navigateToNewProfile());
  }, [dispatch]);

  return (
    <>
      {users?.map((user, index) => (
        <Profile
          key={user.id}
          name={user.email.split('@')[0] || `User ${index + 1}`}
          index={index}
          left={positions[index]}
          onOpen={onProfileOpen}
          onSelect={onProfileSelect}
        />
      ))}
      <NewProfile
        color="#d81f27"
        index={users.length}
        left={positions[users.length]}
        onOpen={onNewProfileOpen}
        onSelect={onProfileSelect}
      />
    </>
  );
};
