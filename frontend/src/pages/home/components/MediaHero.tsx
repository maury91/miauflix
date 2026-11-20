import { useRenderMode } from '@shared/design-system/gl';
import type { FC } from 'react';

import { MediaHeroDom } from '../hero/MediaHeroDom';
import { MediaHeroGl } from '../hero/MediaHeroGl';
import type { MediaHeroProps } from '../hero/useMediaHero';

/**
 * Home's hero: the selected title's details, source status and backdrop, crossfading as the
 * selection rests (hero/heroMotion.ts). Drawn by Home's GL surface (MediaHeroGl), or as DOM
 * (MediaHeroDom); what both show comes from useMediaHero and heroDetailsModel.
 */
export const MediaHero: FC<MediaHeroProps> = props =>
  useRenderMode() === 'gl' ? <MediaHeroGl {...props} /> : <MediaHeroDom {...props} />;
