import { useEffect } from 'react';

/** Content gap after the 5vw (min 56px) rail, as a share of the viewport width. */
const RAIL_CONTENT_GAP = 0.024;

/** Line the shared app logo up with content that starts just right of the rail, as Home does. */
export function useRailContentLeft(): void {
  useEffect(() => {
    const align = () => {
      const left = Math.max(window.innerWidth * 0.05, 56) + window.innerWidth * RAIL_CONTENT_GAP;
      document.body.style.setProperty('--home-content-left', `${left}px`);
    };
    align();
    window.addEventListener('resize', align);
    return () => {
      window.removeEventListener('resize', align);
      document.body.style.removeProperty('--home-content-left');
    };
  }, []);
}
