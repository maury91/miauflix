import { useWindowSize } from '@shared/hooks/useWindowSize';
import { useMemo } from 'react';

export const useMediaBoxSizes = () => {
  const { width, height } = useWindowSize();

  return useMemo(() => {
    const mediaWidth = 0.352 * height;
    const gap = 0.02 * height;
    const leftMargin = 0.05 * width;
    const mediaPerPage = Math.floor((width - gap - leftMargin * 2) / (mediaWidth + gap));
    const totalMediaWidth = mediaWidth * mediaPerPage + gap * (mediaPerPage - 1);
    const margin = (width - totalMediaWidth) / 2;
    const peekWidth = Math.min(mediaWidth * 0.5, Math.max(0, margin));

    return {
      mediaWidth,
      mediaPerPage,
      gap,
      margin,
      peekWidth,
      width: totalMediaWidth,
      windowWidth: width,
      windowHeight: height,
    };
  }, [width, height]);
};
