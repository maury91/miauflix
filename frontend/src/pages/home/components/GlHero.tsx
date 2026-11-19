import type { MediaDto, PreloadPreparationSnapshot } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import {
  cubicBezier,
  GlParentProvider,
  hex,
  type Painter,
  type TextSpec,
  useGlImageStatus,
  useGlLayer,
  useGlNode,
  useGlPaint,
  useGlParent,
} from '@shared/design-system/gl';
import { color } from '@shared/design-system/tokens';
import { type BackdropFocus, getBackdropPlacement } from '@shared/lib/backdrop-focus';
import { artworkUrl, formatRuntime, getMediaTitle } from '@shared/lib/media.utils';
import { qualityLabel, sourceQualityState } from '@shared/ui/quality-badge/quality';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { StackedBackdrop } from '../backdrop-stack';
import { getHeroBackdropLayout, getHeroTextGeometry } from '../hero-backdrop-layout';
import { HOME_GL_LAYERS } from '../homeGlLayers';

/**
 * Spike (VITE_TV_GL_ROWS): Home's hero drawn in the rows' GL surface, under them. MediaHero keeps
 * choosing the title, loading the backdrop and its focus, and stacking the crossfade layers; this
 * draws them: the backdrops (350 ms crossfade), the shade (canvas 2D gradients, drawn once per
 * size), and the details (logo or title, metadata, quality, genres, overview) as text textures.
 * The DOM keeps a hidden, live header with the same text.
 */

export interface GlHeroLayer {
  key: string;
  url: string;
  focus: BackdropFocus | null;
  imageWidth: number;
  imageHeight: number;
}

/** The backdrop crossfade (MediaHero's BACKDROP_FADE_MS). */
const FADE_MS = 400;
/** The details' fade out and in (MediaHero's DETAILS_FADE_MS). */
const DETAILS_FADE_MS = 200;
/** How long the details wait for a logo still being made before showing the title. */
const LOGO_WAIT_MS = 600;
const LOGO_WIDTH = 420;
/** CSS `ease`, as the DOM crossfade. */
const ease = cubicBezier(0.25, 0.1, 0.25, 1);

/** Fades end at once for those who asked for less motion (as the DOM hero's transitions). */
const fadeMs = (ms: number) =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 0
    : ms;

const clamp = (min: number, value: number, max: number) => Math.min(max, Math.max(min, value));

interface GlHeroProps {
  /** The details shown (the selection once it rested). */
  media: MediaDto | null;
  heroLogo: string | null | undefined;
  /** The shown title's logo is still being made: wait for it (at most LOGO_WAIT_MS). */
  logoPending: boolean;
  /** The selection moved on: the details fade out, and stay out until it rests. */
  moving: boolean;
  /** Where the selection is heading: its texts and logo load meanwhile. */
  upcoming: { media: MediaDto; heroLogo: string | null | undefined } | null;
  layers: StackedBackdrop<GlHeroLayer>[];
  /** A layer's fade landed: the layers under it can go. */
  onSettle: (id: number) => void;
  /** A layer's image failed: it goes, the layers under it stay. */
  onFail: (id: number) => void;
  /** The rows' left edge (`--home-content-left`). */
  detailsLeft: number;
  windowHeight: number;
  preparation: PreloadPreparationSnapshot | null;
  availability: 'available' | 'pending' | 'unavailable' | null | undefined;
}

export function GlHero({
  media,
  heroLogo,
  logoPending,
  moving,
  upcoming,
  layers,
  onSettle,
  onFail,
  detailsLeft,
  windowHeight,
  preparation,
  availability,
}: GlHeroProps) {
  const parent = useGlParent();
  const width = parent?.width ?? 0;
  const height = windowHeight * 0.55;
  const heroNode = useGlNode();
  // Live, under the baked hero: a crossfade only changes their opacity, no re-bake
  const backdropsNode = useGlNode(useGlLayer(HOME_GL_LAYERS.heroBackdrops) ?? heroNode);
  const shadeNode = useGlNode(heroNode);
  // Live too: its texts land one by one, and each would re-bake the shade
  const detailsNode = useGlNode(useGlLayer(HOME_GL_LAYERS.heroDetails) ?? heroNode);
  const layout = getHeroBackdropLayout(width, detailsLeft);
  const geometry = getHeroTextGeometry(width, detailsLeft);

  useLayoutEffect(() => {
    heroNode?.set({ width, height });
    backdropsNode?.set({
      x: layout?.left ?? 0,
      width: layout?.width ?? 0,
      height,
      clip: true,
      z: 1,
    });
    shadeNode?.set({ z: 2 });
    detailsNode?.set({ z: 3 });
  });
  // No black fill: the page under the canvas is black (homePage.css.ts), the backdrops are drawn
  // under this layer, and the shade baked here ends in black
  useGlPaint(
    shadeNode,
    painter => paintShade(painter, width, height, windowHeight, geometry),
    // geometry follows width and detailsLeft
    [width, height, windowHeight, detailsLeft]
  );

  const details = useMemo(
    () =>
      media
        ? heroDetails(media, preparation, availability, windowHeight, geometry.detailsWidth)
        : null,
    // geometry follows width and detailsLeft

    [availability, media, preparation, windowHeight, geometry.detailsWidth]
  );
  const logoUrl = heroLogo ? artworkUrl(heroLogo, 'logo', 500) : null;
  const logoStatus = useGlImageStatus(logoUrl);
  // A logo still being made: wait a little for it, then show the title
  const [logoWaitOver, setLogoWaitOver] = useState(false);
  useEffect(() => {
    setLogoWaitOver(false);
    if (!logoPending) return;
    const timer = window.setTimeout(() => setLogoWaitOver(true), LOGO_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [logoPending, media]);
  // The next title's texts and logo load while the details fade out
  const upcomingMedia = upcoming?.media ?? null;
  const upcomingDetails = useMemo(
    () =>
      upcomingMedia
        ? heroDetails(upcomingMedia, null, undefined, windowHeight, geometry.detailsWidth)
        : null,
    [upcomingMedia, windowHeight, geometry.detailsWidth]
  );
  const upcomingLogo = upcoming?.heroLogo ? artworkUrl(upcoming.heroLogo, 'logo', 500) : null;
  useEffect(() => {
    if (upcomingLogo) parent?.renderer.preload(upcomingLogo, LOGO_WIDTH);
  }, [parent, upcomingLogo]);
  const shown = useRef<{
    details: HeroDetails;
    useLogo: boolean;
    logoUrl: string | null;
  } | null>(null);
  useGlPaint(
    detailsNode,
    painter => {
      if (upcomingDetails)
        for (const spec of upcomingDetails.texts(Boolean(upcomingLogo))) painter.measure(spec);
      if (!details || !detailsNode) return;
      // Asked for here (and held), not only where it's drawn: the details wait for it
      const loaded = logoUrl ? painter.load(logoUrl, LOGO_WIDTH) : 'failed';
      const useLogo = Boolean(logoUrl) && loaded !== 'failed';
      // Shown only whole: every text, and the logo settled (or the title, the logo failing). All
      // measured (queued) at once, not up to the first missing
      const measured = details.texts(useLogo).map(spec => painter.measure(spec));
      const ready =
        measured.every(Boolean) &&
        (!useLogo || loaded === 'ready') &&
        (!logoPending || logoWaitOver);
      if (ready) shown.current = { details, useLogo, logoUrl };
      // The same title's details changing (its quality known) keep the last whole ones meanwhile
      const current = ready
        ? shown.current
        : shown.current?.details.media === media
          ? shown.current
          : null;
      if (moving || !current) detailsNode.animate('opacity', 0, fadeMs(DETAILS_FADE_MS), ease);
      if (!current) return;
      current.details.paint(painter, {
        left: detailsLeft,
        bottom: height - windowHeight * 0.09,
        logoUrl: current.useLogo ? current.logoUrl : null,
        useLogo: current.useLogo,
        width,
      });
      if (!moving) detailsNode.animate('opacity', 1, fadeMs(DETAILS_FADE_MS), ease);
    },
    [
      details,
      logoUrl,
      logoStatus,
      logoPending,
      logoWaitOver,
      moving,
      upcomingDetails,
      upcomingLogo,
      detailsLeft,
      height,
      windowHeight,
      width,
    ]
  );

  const layoutValue = useMemo(
    () =>
      parent && backdropsNode
        ? {
            renderer: parent.renderer,
            node: backdropsNode,
            width: layout?.width ?? 0,
            height,
            radius: 0,
          }
        : null,
    [backdropsNode, height, layout?.width, parent]
  );
  if (!layoutValue) return null;
  return (
    <GlParentProvider value={layoutValue}>
      {layers.map(layer => (
        <GlBackdrop
          key={layer.id}
          layer={layer.backdrop}
          visible={layer.visible}
          paused={moving}
          onSettle={() => onSettle(layer.id)}
          onFail={() => onFail(layer.id)}
          targetX={layout?.targetX}
          targetY={layout?.targetY}
        />
      ))}
    </GlParentProvider>
  );
}

/** One backdrop layer, placed like the CSS background (`getBackdropPlacement`), fading in. */
function GlBackdrop({
  layer,
  visible,
  paused,
  targetX,
  targetY,
  onSettle,
  onFail,
}: {
  layer: GlHeroLayer;
  visible: boolean;
  /**
   * The selection is moving: a crossfade under way ends at once on this layer (the old ones go),
   * one not started waits for the selection to rest.
   */
  paused: boolean;
  onSettle: () => void;
  onFail: () => void;
  targetX?: number;
  targetY?: number;
}) {
  const parent = useGlParent();
  const node = useGlNode();
  const width = parent?.width ?? 0;
  const height = parent?.height ?? 0;
  // Fades in once revealed and its texture is up (until then it draws nothing, so the layer
  // under it stays)
  const status = useGlImageStatus(layer.url);
  // Before the effect below reads them
  const settleRef = useRef(onSettle);
  const failRef = useRef(onFail);
  useLayoutEffect(() => {
    settleRef.current = onSettle;
    failRef.current = onFail;
  });
  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!node) return;
    if (!mounted.current) node.set({ opacity: visible && status === 'ready' ? 1 : 0 });
    else if (visible && status === 'ready') {
      if (!paused) node.animate('opacity', 1, fadeMs(FADE_MS), ease);
      // Interrupted: shown whole now (a set ends the animation), the layers under it drop below
      else if (node.animations.opacity) node.set({ opacity: 1 });
    }
    mounted.current = true;
    if (!visible) return;
    // Failed: only this layer goes (the one under it is the last that drew)
    if (status === 'failed') failRef.current();
    else if (status === 'ready' && node.opacity === 1 && !node.animations.opacity)
      settleRef.current();
  }, [node, paused, status, visible]);
  useEffect(() => {
    if (!node) return;
    node.onSettle = property => {
      if (property === 'opacity' && node.opacity === 1) settleRef.current();
    };
    return () => {
      node.onSettle = null;
    };
  }, [node]);
  const rect = useMemo(() => {
    const placement = getBackdropPlacement(layer.focus, {
      imageWidth: layer.imageWidth,
      imageHeight: layer.imageHeight,
      containerWidth: width,
      containerHeight: height,
      targetX,
      targetY,
      maxZoom: 1.5,
    });
    let renderedWidth: number;
    let renderedHeight: number;
    if (placement.size === 'cover') {
      const scale = Math.max(width / layer.imageWidth, height / layer.imageHeight);
      renderedWidth = layer.imageWidth * scale;
      renderedHeight = layer.imageHeight * scale;
    } else {
      [renderedWidth, renderedHeight] = placement.size.split(' ').map(parseFloat);
    }
    const [px, py] = placement.position.split(' ').map(value => parseFloat(value) / 100);
    return {
      x: (width - renderedWidth) * px,
      y: (height - renderedHeight) * py,
      w: renderedWidth,
      h: renderedHeight,
    };
  }, [height, layer, targetX, targetY, width]);
  useGlPaint(
    node,
    painter => {
      // At its placed size (`contain` on a box of the image's own ratio), covering the container
      // No sprite fade: the node's crossfade is the fade (instant under reduced motion), and the
      // layers under it go when it lands
      painter.image(layer.url, rect.x, rect.y, rect.w, rect.h, { fit: 'contain', fade: false });
    },
    [layer.url, rect]
  );
  return null;
}

/** The hero's `::before` and `::after` gradients (MediaHero.tsx), half resolution. */
function paintShade(
  painter: Painter,
  width: number,
  height: number,
  windowHeight: number,
  shade: ReturnType<typeof getHeroTextGeometry>
) {
  const scale = 0.5;
  const key = `hero-shade-v2:${Math.round(width)}x${Math.round(height)}:${Math.round(shade.detailsLeft)}`;
  painter.canvas(
    key,
    width * scale,
    height * scale,
    context => {
      context.scale(scale, scale);
      const at = (fromText: number, fromFree: number) =>
        fromText * shade.textRight + fromFree * shade.freeWidth;
      // Painted bottom up: CSS lists the top layer first
      const bottom = context.createLinearGradient(0, height, 0, 0);
      bottom.addColorStop(0, '#000');
      bottom.addColorStop(0.17, 'rgba(0,0,0,0.62)');
      bottom.addColorStop(0.48, 'rgba(0,0,0,0)');
      context.fillStyle = bottom;
      context.fillRect(0, 0, width, height);
      const side = context.createLinearGradient(0, 0, width, 0);
      side.addColorStop(0, '#03050d');
      // Opaque up to the backdrop's left edge (the backdrop starts at backdropLeft, under the
      // details), then fading: its edge never shows
      const backdropLeft = getHeroBackdropLayout(width, shade.detailsLeft)?.left ?? 0;
      side.addColorStop(clamp(0, backdropLeft / width, 1), '#03050d');
      side.addColorStop(
        clamp(0, (backdropLeft + shade.detailsWidth * 0.08) / width, 1),
        'rgba(3,5,13,0.96)'
      );
      side.addColorStop(clamp(0, at(1, 0.14) / width, 1), 'rgba(3,5,13,0.35)');
      side.addColorStop(clamp(0, at(1, 0.55) / width, 1), 'rgba(3,5,13,0)');
      context.fillStyle = side;
      context.fillRect(0, 0, width, height);
      // ellipse 72% 115% at (text right + 70% of the free width) 0%
      const rx = width * 0.72;
      const ry = height * 1.15;
      context.save();
      context.translate(at(1, 0.7), 0);
      context.scale(rx / ry, 1);
      const radial = context.createRadialGradient(0, 0, 0, 0, 0, ry);
      radial.addColorStop(0.35, 'rgba(0,0,0,0)');
      radial.addColorStop(0.51, 'rgba(0,0,0,0.16)');
      radial.addColorStop(0.75, 'rgba(0,0,0,0.78)');
      radial.addColorStop(1, '#000');
      context.fillStyle = radial;
      context.fillRect(-width * 4, -height, width * 8, height * 4);
      context.restore();
      // ::after: from 39.5vh, 15.5vh tall, from 28.5% of the free width
      const top = windowHeight * 0.395;
      const afterHeight = windowHeight * 0.155;
      const after = context.createLinearGradient(0, top, 0, top + afterHeight);
      after.addColorStop(0, 'rgba(0,0,0,0)');
      after.addColorStop(0.53, 'rgba(0,0,0,0.5)');
      after.addColorStop(1, '#000');
      context.fillStyle = after;
      const left = at(1, 0.285);
      context.fillRect(left, top, width - left, afterHeight);
    },
    0,
    0,
    width,
    height
  );
}

type HeroDetails = ReturnType<typeof heroDetails>;

/** The details' texts and how they stack (MediaHero's HeroDetails, bottom up from the padding). */
function heroDetails(
  media: MediaDto,
  preparation: PreloadPreparationSnapshot | null,
  availability: GlHeroProps['availability'],
  windowHeight: number,
  detailsWidth: number
) {
  const titleSize = clamp(32, windowHeight * 0.05, 73.6);
  const metaSize = clamp(13.6, windowHeight * 0.021, 19.2);
  const overviewSize = clamp(14.4, windowHeight * 0.023, 20.8);
  const statusSize = clamp(12.16, windowHeight * 0.018, 16);
  const text = color.text;
  const spec = (
    value: string,
    size: number,
    weight: number,
    lineHeight: number,
    fill: string,
    maxWidth: number,
    maxLines = 1
  ): TextSpec => ({ text: value, size, weight, lineHeight, color: fill, maxWidth, maxLines });

  const title = spec(getMediaTitle(media), titleSize, 600, 1.05, text, detailsWidth, 2);
  const date = media._type === 'movie' ? media.releaseDate : media.firstAirDate;
  const parts = [
    media._type === 'movie' && media.runtime ? formatRuntime(media.runtime) : '',
    date?.slice(0, 4) ?? '',
  ].filter(Boolean);
  const metaParts = parts.map(part => spec(part, metaSize, 500, 1.5, text, detailsWidth));
  const rating = media.rating
    ? {
        star: spec('★', metaSize * 1.05, 500, 1.5, '#f6b93b', 100),
        value: spec(media.rating.toFixed(1), metaSize, 500, 1.5, text, 100),
      }
    : null;
  const status = heroStatus(media, preparation, availability);
  const statusText = status ? spec(status.label, statusSize, 600, 1.4, status.color, 300) : null;
  const genres = media.genres.length
    ? spec(media.genres.join(' · '), metaSize, 500, 1.5, text, detailsWidth)
    : null;
  const overview = media.overview
    ? spec(
        media.overview,
        overviewSize,
        400,
        1.5,
        text,
        Math.min(detailsWidth, overviewSize * 0.55 * 62),
        3
      )
    : null;

  return {
    media,
    texts(useLogo: boolean) {
      return [
        ...(useLogo ? [] : [title]),
        ...metaParts,
        ...(rating ? [rating.star, rating.value] : []),
        ...(statusText ? [statusText] : []),
        ...(genres ? [genres] : []),
        ...(overview ? [overview] : []),
      ];
    },
    paint(
      painter: Painter,
      {
        left,
        bottom,
        logoUrl,
        useLogo,
        width,
      }: { left: number; bottom: number; logoUrl: string | null; useLogo: boolean; width: number }
    ) {
      let y = bottom;
      if (overview) y -= painter.text(overview, left, y, { anchorY: 1 })?.height ?? 0;
      if (genres) {
        y -= windowHeight * 0.01;
        y -= painter.text(genres, left, y, { anchorY: 1 })?.height ?? 0;
      }
      // The metadata line: items with dots between, the rating, then the quality badge
      y -= windowHeight * 0.01;
      const lineHeight = Math.max(metaSize * 1.5, 28.8);
      const middle = y - lineHeight / 2;
      let x = left;
      const dot = (gap: number) => {
        const size = metaSize * 0.28;
        x += metaSize * 0.55;
        painter.rect(x, middle - size / 2, size, size, hex(PALETTE.text.secondary), {
          radius: size / 2,
        });
        x += size + gap;
      };
      metaParts.forEach((part, index) => {
        if (index > 0) dot(metaSize * 0.55);
        x += painter.text(part, x, middle, { anchorY: 0.5 })?.width ?? 0;
      });
      if (rating) {
        if (metaParts.length) dot(metaSize * 0.55);
        x += painter.text(rating.star, x, middle, { anchorY: 0.5 })?.width ?? 0;
        x += metaSize * 0.3;
        x += painter.text(rating.value, x, middle, { anchorY: 0.5 })?.width ?? 0;
      }
      if (status && statusText) {
        x += metaSize * 0.9;
        const label = painter.measure(statusText);
        if (label) {
          const padX = 9.28;
          const badgeHeight = 26.4;
          const badgeWidth = label.width + padX * 2;
          const top = middle - badgeHeight / 2;
          painter.rect(x, top, badgeWidth, badgeHeight, hex(status.border), { radius: 5.6 });
          painter.rect(x + 1, top + 1, badgeWidth - 2, badgeHeight - 2, hex(status.fill), {
            radius: 4.6,
          });
          painter.text(statusText, x + padX, middle, { anchorY: 0.5 });
        }
      }
      y -= lineHeight;
      // The logo (or the title) above
      if (useLogo && logoUrl) {
        y -= windowHeight * 0.015;
        const boxWidth = Math.min(width * 0.28, LOGO_WIDTH);
        const boxHeight = windowHeight * 0.12;
        painter.image(logoUrl, left, y - boxHeight, boxWidth, boxHeight, {
          fit: 'contain',
          alignX: 0,
          alignY: 1,
        });
      } else {
        y -= windowHeight * 0.01;
        painter.text(title, left, y, { anchorY: 1 });
      }
    },
  };
}

/** SourcePreparationStatus as one badge: checking, no source, or the quality. */
function heroStatus(
  media: MediaDto,
  preparation: PreloadPreparationSnapshot | null,
  availability: GlHeroProps['availability']
) {
  if (media._type !== 'movie') return null;
  if (preparation && preparation.playable.kind !== 'movie') return null;
  const unavailable =
    availability === 'unavailable' ||
    (availability !== 'available' && preparation?.state === 'unavailable');
  const neutral = {
    border: PALETTE.background.border,
    fill: 'rgba(17, 23, 25, 0.86)',
  };
  if (unavailable) return { label: 'No source', color: PALETTE.text.disabled, ...neutral };
  const source = preparation?.source;
  const quality = source && source.quality == null ? '720p' : qualityLabel(source?.quality ?? null);
  if (!preparation || preparation.state === 'checking')
    return {
      label: 'Checking…',
      color: PALETTE.text.secondary,
      ...neutral,
      fill: 'rgba(0,0,0,0)',
      border: 'rgba(0,0,0,0)',
    };
  if (!quality) return null;
  const state = sourceQualityState(source?.sourceType ?? null);
  if (state === 'clean')
    return {
      label: `✦ ${quality}`,
      color: '#ffe17a',
      border: 'rgba(236, 188, 41, 0.72)',
      fill: 'rgba(91, 67, 7, 0.34)',
    };
  if (state === 'warning')
    return {
      label: quality,
      color: PALETTE.text.disabled,
      border: 'rgba(166, 173, 175, 0.32)',
      fill: 'rgba(46, 51, 53, 0.74)',
    };
  return { label: quality, color: PALETTE.text.secondary, ...neutral };
}

/** The hidden DOM for assistive technology: the hero's text, announced as it changes. */
export function GlHeroText({
  media,
  preparation,
  availability,
}: {
  media: MediaDto | null;
  preparation: PreloadPreparationSnapshot | null;
  availability: GlHeroProps['availability'];
}) {
  if (!media) return null;
  // The source status drawn on the canvas ("No source", the quality), announced as it changes
  const status = heroStatus(media, preparation, availability)?.label;
  const date = media._type === 'movie' ? media.releaseDate : media.firstAirDate;
  return (
    <header
      aria-live="polite"
      style={{ position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none' }}
    >
      <h1>{getMediaTitle(media)}</h1>
      <p>
        {[
          media._type === 'movie' && media.runtime ? formatRuntime(media.runtime) : '',
          date?.slice(0, 4),
          media.rating ? `${media.rating.toFixed(1)} stars` : '',
        ]
          .filter(Boolean)
          .join(', ')}
      </p>
      {media.genres.length > 0 && <p>{media.genres.join(' · ')}</p>}
      <p>{media.overview}</p>
      {status && <p role="status">{status}</p>}
    </header>
  );
}
