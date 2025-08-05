import type { FC } from 'react';

import type { VideoQualityStr } from '@/types/video';
import MaterialSymbolsLight2kOutline from '~icons/material-symbols-light/2k-outline';
import MaterialSymbolsLight4kOutline from '~icons/material-symbols-light/4k-outline';
import MaterialSymbolsLightFullHdOutline from '~icons/material-symbols-light/full-hd-outline';
import MaterialSymbolsLightHdOutline from '~icons/material-symbols-light/hd-outline';

export const MediaQuality: FC<{ qualities?: (VideoQualityStr | null)[] }> = ({ qualities }) => {
  const highestQuality = [...(qualities ?? [])].sort((a, b) => Number(b) - Number(a))[0];
  switch (highestQuality) {
    case '8K':
    // return <MaterialSymbolsLight8kOutline />;
    // fallback to 4K icon until we have a 8K icon
    case '4K':
      return <MaterialSymbolsLight4kOutline />;
    case '2K':
      return <MaterialSymbolsLight2kOutline />;
    case 'FHD':
      return <MaterialSymbolsLightFullHdOutline />;
    case 'HD':
      return <MaterialSymbolsLightHdOutline />;
    case 'SD':
      // return <MaterialSymbolsLightSdOutline />;
      return null;
  }
  return null;
};
