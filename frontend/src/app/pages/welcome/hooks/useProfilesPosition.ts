import { useMemo } from 'react';
import { FOCUSED_PROFILE_SIZE, PROFILE_SIZE } from '../components/profile';

const PROFILE_GAP = 5;

export const useProfilesPosition = (profilesCount: number, profileSelected: number) => {
  return useMemo(() => {
    const numberOfElements = profilesCount + 1;
    const hasSelected = profileSelected < numberOfElements;
    const FOCUSED_EXTRA_WIDTH = (FOCUSED_PROFILE_SIZE - PROFILE_SIZE) / 4;
    const totalWidth =
      (PROFILE_SIZE + PROFILE_GAP) * profilesCount +
      (hasSelected ? PROFILE_SIZE + FOCUSED_EXTRA_WIDTH : PROFILE_SIZE);
    const ratio = Math.max(totalWidth / 90, 1);

    return Array.from({ length: numberOfElements }, (_, index) =>
      index + 1 === (numberOfElements + 1) / 2
        ? // special case, the center on an odd number
          50
        : index < numberOfElements / 2
          ? 50 - ((numberOfElements / 2 - index - 0.5) * (PROFILE_SIZE + PROFILE_GAP)) / ratio
          : 50 + ((index - numberOfElements / 2 + 0.5) * (PROFILE_SIZE + PROFILE_GAP)) / ratio
    );
  }, [profilesCount, profileSelected]);
};
