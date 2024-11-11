import { UserDto } from '@miauflix/types';
import { FC, useState } from 'react';
import { useProfilesPosition } from '../hooks/useProfilesPosition';
import { NewProfile, Profile } from './profile';
import { colors } from '../consts';

export interface ProfileSliderProps {
  navigateTo: (key: string) => void;
  users?: UserDto[];
}

export const ProfileSlider: FC<ProfileSliderProps> = ({ navigateTo, users }) => {
  const [selected, setSelected] = useState(0);
  const profilesCount = users?.length ?? 0;

  const positions = useProfilesPosition(profilesCount, selected);

  return (
    <>
      {users?.map(({ name }, index) => (
        <Profile
          key={index}
          index={index}
          left={positions[index]}
          name={name}
          color={colors[index % colors.length]}
          onClick={navigateTo}
          onSelect={setSelected}
        />
      ))}
      <NewProfile
        index={profilesCount}
        left={positions[profilesCount]}
        color="white"
        onClick={navigateTo}
        onSelect={setSelected}
      />
    </>
  );
};
