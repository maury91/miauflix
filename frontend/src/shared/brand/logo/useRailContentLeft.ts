import { useEffect } from 'react';

/*
 * The collapsed width of the old Home rail, which the logo has lined up with since: 3.5em of a font
 * 2.16% of the window's height, between 14.4px and 23.04px.
 */
const FONT_MIN_PX = 14.4;
const FONT_MAX_PX = 23.04;
const FONT_OF_HEIGHT = 0.0216;
const COLLAPSED_EM = 3.5;

function railCollapsedWidth(height: number): number {
  return Math.min(FONT_MAX_PX, Math.max(FONT_MIN_PX, height * FONT_OF_HEIGHT)) * COLLAPSED_EM;
}

/** Content gap after the collapsed rail, as a share of the viewport width. */
const RAIL_CONTENT_GAP = 0.024;

/** Line the shared app logo up with content that starts just right of the rail, as Home does. */
export function useRailContentLeft(): void {
  useEffect(() => {
    const align = () => {
      const left = railCollapsedWidth(window.innerHeight) + window.innerWidth * RAIL_CONTENT_GAP;
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
