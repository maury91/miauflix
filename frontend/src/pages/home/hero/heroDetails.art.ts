import { hex, type Painter, type TextSpec } from '@shared/design-system/gl/art';
import { color } from '@shared/design-system/tokens';
import type { Translate } from '@shared/i18n';

import type { HeroDetailsModel, HeroStatus } from './heroDetailsModel';
import { HERO_DETAILS, HERO_TYPE, heroTypeScale } from './heroType';

/** The metadata line's height (px): at least the status badge's line. */
const STATUS_LINE = 28.8;
const BADGE = { padX: 9.28, height: 26.4, radius: 5.6 };
const STAR_COLOR = '#f6b93b';
const NEUTRAL = { border: '#253034', fill: 'rgba(17, 23, 25, 0.86)' };
/** The old status badge's dim text (before the design system's Badge). */
const TEXT_DIM = '#50585B';

/** The status badge's text and colours, as the hero has drawn them since before the Badge. */
function statusLook(status: HeroStatus, t: Translate) {
  if (status.kind === 'unavailable')
    return { label: t('home.noSource'), color: TEXT_DIM, ...NEUTRAL };
  if (status.kind === 'checking')
    return {
      label: t('home.checking'),
      color: color.textSecondary,
      border: 'rgba(0,0,0,0)',
      fill: 'rgba(0,0,0,0)',
    };
  if (status.state === 'clean')
    return {
      label: `✦ ${status.label}`,
      color: '#ffe17a',
      border: 'rgba(236, 188, 41, 0.72)',
      fill: 'rgba(91, 67, 7, 0.34)',
    };
  if (status.state === 'warning')
    return {
      label: status.label,
      color: TEXT_DIM,
      border: 'rgba(166, 173, 175, 0.32)',
      fill: 'rgba(46, 51, 53, 0.74)',
    };
  return { label: status.label, color: color.textSecondary, ...NEUTRAL };
}

export interface HeroDetailsArtOptions {
  windowHeight: number;
  /** The details' column width (getHeroTextGeometry). */
  detailsWidth: number;
  /** The hero's width: the logo's box is a share of it. */
  width: number;
  /** The interface language's translate function (`useT`), for the status badge. */
  t: Translate;
}

/**
 * The hero details' picture: logo or title, the metadata line (with dots, the rating and the
 * status badge), genres and overview, stacked bottom up from `bottom` (MediaHero's DOM details).
 * `texts` lists every text it draws, so a caller can wait for all of them before showing any.
 */
export function heroDetailsArt(
  model: HeroDetailsModel,
  { windowHeight, detailsWidth, width, t }: HeroDetailsArtOptions
) {
  const type = heroTypeScale(windowHeight);
  const metaSize = type.metadata;
  const spec = (
    role: keyof typeof HERO_TYPE,
    text: string,
    fill: string,
    maxWidth: number,
    options: { size?: number; maxLines?: number } = {}
  ): TextSpec => ({
    text,
    size: options.size ?? type[role],
    weight: HERO_TYPE[role].weight,
    lineHeight: HERO_TYPE[role].lineHeight,
    color: fill,
    maxWidth,
    maxLines: options.maxLines ?? 1,
  });
  const title = spec('title', model.title, color.text, detailsWidth, {
    maxLines: HERO_DETAILS.titleLines,
  });
  const metaParts = model.metadata.map(part => spec('metadata', part, color.text, detailsWidth));
  const rating = model.rating
    ? {
        star: spec('metadata', '★', STAR_COLOR, 100, { size: metaSize * 1.05 }),
        value: spec('metadata', model.rating, color.text, 100),
      }
    : null;
  const status = model.status ? statusLook(model.status, t) : null;
  const statusText = status ? spec('status', status.label, status.color, 300) : null;
  const genres = model.genres ? spec('metadata', model.genres, color.text, detailsWidth) : null;
  const overview = model.overview
    ? spec(
        'overview',
        model.overview,
        color.text,
        // `62ch`: about 0.55 em per character
        Math.min(detailsWidth, type.overview * 0.55 * HERO_DETAILS.overviewCh),
        { maxLines: HERO_DETAILS.overviewLines }
      )
    : null;
  const gap = (windowHeight * HERO_DETAILS.lineGapVh) / 100;

  return {
    model,
    texts(useLogo: boolean): TextSpec[] {
      return [
        ...(useLogo ? [] : [title]),
        ...metaParts,
        ...(rating ? [rating.star, rating.value] : []),
        ...(statusText ? [statusText] : []),
        ...(genres ? [genres] : []),
        ...(overview ? [overview] : []),
      ];
    },
    draw(
      painter: Painter,
      { left, bottom, logoUrl }: { left: number; bottom: number; logoUrl: string | null }
    ) {
      let y = bottom;
      if (overview) y -= painter.text(overview, left, y, { anchorY: 1 })?.height ?? 0;
      if (genres) {
        y -= gap;
        y -= painter.text(genres, left, y, { anchorY: 1 })?.height ?? 0;
      }
      // The metadata line: items with dots between, the rating, then the status badge
      y -= gap;
      const lineHeight = Math.max(metaSize * HERO_TYPE.metadata.lineHeight, STATUS_LINE);
      const middle = y - lineHeight / 2;
      let x = left;
      const dot = () => {
        const size = metaSize * 0.28;
        x += metaSize * 0.55;
        painter.rect(x, middle - size / 2, size, size, hex(color.textSecondary), {
          radius: size / 2,
        });
        x += size + metaSize * 0.55;
      };
      metaParts.forEach((part, index) => {
        if (index > 0) dot();
        x += painter.text(part, x, middle, { anchorY: 0.5 })?.width ?? 0;
      });
      if (rating) {
        if (metaParts.length) dot();
        x += painter.text(rating.star, x, middle, { anchorY: 0.5 })?.width ?? 0;
        x += metaSize * 0.3;
        x += painter.text(rating.value, x, middle, { anchorY: 0.5 })?.width ?? 0;
      }
      if (status && statusText) {
        x += metaSize * 0.9;
        const label = painter.measure(statusText);
        if (label) {
          const badgeWidth = label.width + BADGE.padX * 2;
          const top = middle - BADGE.height / 2;
          painter.rect(x, top, badgeWidth, BADGE.height, hex(status.border), {
            radius: BADGE.radius,
          });
          painter.rect(x + 1, top + 1, badgeWidth - 2, BADGE.height - 2, hex(status.fill), {
            radius: BADGE.radius - 1,
          });
          painter.text(statusText, x + BADGE.padX, middle, { anchorY: 0.5 });
        }
      }
      y -= lineHeight;
      // The logo (or the title) above
      if (logoUrl) {
        y -= (windowHeight * HERO_DETAILS.logoGapVh) / 100;
        const boxWidth = Math.min(
          (width * HERO_DETAILS.logoWidthVw) / 100,
          HERO_DETAILS.logoMaxWidth
        );
        const boxHeight = (windowHeight * HERO_DETAILS.logoHeightVh) / 100;
        painter.image(logoUrl, left, y - boxHeight, boxWidth, boxHeight, {
          fit: 'contain',
          alignX: 0,
          alignY: 1,
        });
      } else {
        y -= gap;
        painter.text(title, left, y, { anchorY: 1 });
      }
    },
  };
}

export type HeroDetailsArt = ReturnType<typeof heroDetailsArt>;
