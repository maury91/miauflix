import { useLayoutEffect, useState } from 'react';

export const useWindowSize = () => {
  const isServerSide = typeof window === 'undefined';

  const [size, setSize] = useState({
    width: isServerSide ? 1920 : window.innerWidth, // Default to common desktop size on server
    height: isServerSide ? 1080 : window.innerHeight,
  });

  useLayoutEffect(() => {
    if (isServerSide) {
      return;
    }

    function updateSize() {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, [isServerSide]);

  return size;
};
