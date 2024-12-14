import { UserDto } from '@miauflix/types';
import { FC, useCallback, useState } from 'react';
import { useProfilesPosition } from '../hooks/useProfilesPosition';
import { NewProfile, Profile } from './profile';
import { chooseProfile } from '../../../../store/slices/app';
import { useAppDispatch } from '../../../../store/store';
import { navigateToNewProfile } from '../../../../store/slices/profileSelection';

export interface ProfileSliderProps {
  users?: UserDto[];
}

export const ProfileSlider: FC<ProfileSliderProps> = ({ users }) => {
  const [selected, setSelected] = useState(0);
  const dispatch = useAppDispatch();
  const profilesCount = users?.length ?? 0;
  const positions = useProfilesPosition(profilesCount, selected);

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

  const openNewProfile = useCallback(() => {
    dispatch(navigateToNewProfile());
  }, [dispatch]);

  return (
    <>
      {users?.map(({ name }, index) => (
        <Profile
          key={index}
          index={index}
          left={positions[index]}
          name={name}
          onOpen={openProfile}
          onSelect={setSelected}
        />
      ))}
      <NewProfile
        index={profilesCount}
        left={positions[profilesCount]}
        color="white"
        onOpen={openNewProfile}
        onSelect={setSelected}
      />
    </>
  );
};
