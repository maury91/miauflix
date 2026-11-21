import { color } from '@shared/design-system/tokens';
import { globalStyle, style } from '@vanilla-extract/css';

import { HERO_DETAILS_LEFT_CSS } from '../hero-backdrop-layout';
import { HOME_VH } from '../homeLayout';
import { BACKDROP_FADE_MS, DETAILS_FADE_MS } from './heroMotion';
import { HERO_SHADE } from './heroShade.metrics';
import { HERO_DETAILS, HERO_TYPE } from './heroType';

const HERO_SHADE_BAND = HERO_SHADE.band;

/*
 * What follows the window (the details' width, the backdrop's left edge, the type sizes, the
 * shade's gradients) is computed in pixels by MediaHeroDom and set inline: `clamp()`/`min()` need
 * the viewport, which the TV build cannot know (docs/development/css-architecture.md, rule 4).
 */

export const hero = style({
  position: 'absolute',
  top: 0,
  right: 0,
  left: 0,
  zIndex: 1,
  boxSizing: 'border-box',
  height: `${HOME_VH.heroHeight}vh`,
  padding: `${HOME_VH.heroPaddingTop}vh 5vw ${HOME_VH.heroPaddingBottom}vh ${HERO_DETAILS_LEFT_CSS}`,
  display: 'flex',
  alignItems: 'flex-end',
  overflow: 'hidden',
  background: '#000',
});

/** The TV rasterizes in software: on their own layers the gradients and backdrops paint once. */
export const tvLayer = style({ willChange: 'transform' });
export const tvOpacityLayer = style({ willChange: 'opacity' });

/** The shade over the backdrops: a radial glow, the side gradient and the bottom fade (inline). */
export const shade = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 2,
  pointerEvents: 'none',
});

/** A soft band across the top of the free side (its left edge and gradient inline). */
export const band = style({
  position: 'absolute',
  top: `${HERO_SHADE_BAND.topVh}vh`,
  right: 0,
  height: `${HERO_SHADE_BAND.heightVh}vh`,
  zIndex: 3,
  pointerEvents: 'none',
});

/** Stacked in DOM order: a later layer fades in over the earlier ones (image and opacity inline). */
export const backdropLayer = style({
  position: 'absolute',
  top: 0,
  right: 0,
  height: `${HOME_VH.heroHeight}vh`,
  zIndex: 1,
  pointerEvents: 'none',
  backgroundColor: '#000',
  backgroundRepeat: 'no-repeat',
  transition: `opacity ${BACKDROP_FADE_MS}ms ease`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
});

export const details = style({
  position: 'relative',
  zIndex: 4,
  transition: `opacity ${DETAILS_FADE_MS}ms ease`,
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
});

export const logo = style({
  maxHeight: `${HERO_DETAILS.logoHeightVh}vh`,
  objectFit: 'contain',
  objectPosition: 'left bottom',
  marginBottom: `${HERO_DETAILS.logoGapVh}vh`,
});

export const title = style({
  margin: `0 0 ${HERO_DETAILS.lineGapVh}vh`,
  lineHeight: HERO_TYPE.title.lineHeight,
  fontWeight: HERO_TYPE.title.weight,
  textTransform: 'none',
});

export const metadata = style({
  margin: `0 0 ${HERO_DETAILS.lineGapVh}vh`,
  color: color.text,
  fontWeight: HERO_TYPE.metadata.weight,
  display: 'flex',
  alignItems: 'center',
});

export const badgeGap = style({ width: '0.9em' });

/** Margins, not `gap`: Chromium 69 has no flex gap. */
export const metadataRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  '@media': { '(max-width: 860px)': { flexWrap: 'wrap' } },
});

export const metadataBlock = style({ minWidth: 0 });

/** Grey dot between metadata items (`2h 11m • 2025 • ★ 7.3`). */
export const metadataDot = style({
  display: 'inline-block',
  flex: 'none',
  width: '0.28em',
  height: '0.28em',
  margin: '0 0.55em',
  borderRadius: '50%',
  verticalAlign: 'middle',
  background: color.textSecondary,
});

/** Rating with a gold star. */
export const rating = style({
  display: 'inline-flex',
  alignItems: 'center',
});

globalStyle(`${rating} svg`, {
  width: '1.05em',
  height: '1.05em',
  marginRight: '0.3em',
  color: '#f6b93b',
});

export const overview = style({
  maxWidth: `${HERO_DETAILS.overviewCh}ch`,
  margin: 0,
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: HERO_DETAILS.overviewLines,
  overflow: 'hidden',
  lineHeight: HERO_TYPE.overview.lineHeight,
});
