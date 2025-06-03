import { FC } from 'react';
import { VideoQualityStr } from '@miauflix/types';
import MaterialSymbolsLight4kOutline from '~icons/material-symbols-light/4k-outline';
import MaterialSymbolsLight2kOutline from '~icons/material-symbols-light/2k-outline';
import MaterialSymbolsLightFullHdOutline from '~icons/material-symbols-light/full-hd-outline';
import MaterialSymbolsLightHdOutline from '~icons/material-symbols-light/hd-outline';

export const MediaQuality: FC<{ qualities?: VideoQualityStr[] }> = ({ qualities }) => {
  const highestQuality = [...(qualities ?? [])].sort((a, b) => Number(b) - Number(a))[0];
  switch (highestQuality) {
    case '2160':
      return <MaterialSymbolsLight4kOutline />;
    case '1440':
      return <MaterialSymbolsLight2kOutline />;
    case '1080':
      return <MaterialSymbolsLightFullHdOutline />;
    case '720':
      return <MaterialSymbolsLightHdOutline />;
  }
  return null;
};
