import type { MediaDto, PreloadPreparationSnapshot } from '@miauflix/backend';
import {
  cubicBezier,
  GlParentProvider,
  useGlImageStatus,
  useGlLayer,
  useGlNode,
  useGlPaint,
  useGlParent,
} from '@shared/design-system/gl';
import { getBackdropPlacement } from '@shared/lib/backdrop-focus';
import { artworkUrl } from '@shared/lib/media.utils';
import { type FC, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { StackedBackdrop } from '../backdrop-stack';
import { getHeroBackdropLayout, getHeroTextGeometry } from '../hero-backdrop-layout';
import { HOME_GL_LAYERS } from '../homeGlLayers';
import { HOME_VH } from '../homeLayout';
import { type HeroDetailsArt, heroDetailsArt } from './heroDetails.art';
import { heroDetailsModel, type SourceAvailability } from './heroDetailsModel';
import { BACKDROP_FADE_MS, DETAILS_FADE_MS, LOGO_WAIT_MS } from './heroMotion';
import { paintHeroShade } from './heroShade.art';
import { HERO_DETAILS } from './heroType';
import { type BackdropLayerState, type MediaHeroProps, useMediaHero } from './useMediaHero';

/** CSS `ease`, as the DOM crossfade. */
const ease = cubicBezier(0.25, 0.1, 0.25, 1);

/**
 * MediaHero drawn in Home's GL surface, under the rows. The shared hook chooses the title, loads
 * the backdrop and its focus and stacks the crossfade layers; this draws them: the backdrops
 * (crossfading), the shade (heroShade.art.ts, drawn once per size) and the details
 * (heroDetails.art.ts). A hidden, live header keeps the same text for the reader.
 */
export const MediaHeroGl: FC<MediaHeroProps> = props => {
  const parent = useGlParent();
  const hero = useMediaHero(props, parent);
  return (
    <>
      <GlHero
        media={hero.detailsMedia}
        heroLogo={hero.detailsLogo.heroLogo}
        logoPending={hero.detailsLogo.pending}
        moving={hero.moving}
        upcoming={hero.upcoming}
        layers={hero.layers}
        onSettle={hero.settle}
        onFail={hero.drop}
        detailsLeft={hero.margin}
        windowHeight={hero.windowHeight}
        preparation={hero.preparation}
        availability={hero.availability}
      />
      <GlHeroText
        media={props.media}
        preparation={hero.preparation}
        availability={hero.availability}
      />
    </>
  );
};

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
  layers: StackedBackdrop<BackdropLayerState>[];
  onSettle: (id: number) => void;
  onFail: (id: number) => void;
  /** The rows' left edge (`--home-content-left`). */
  detailsLeft: number;
  windowHeight: number;
  preparation: PreloadPreparationSnapshot | null;
  availability: SourceAvailability;
}

function GlHero({
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
  const height = (windowHeight * HOME_VH.heroHeight) / 100;
  const detailsBottom = height - (windowHeight * HOME_VH.heroPaddingBottom) / 100;
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
    painter => paintHeroShade(painter, width, height, windowHeight, geometry),
    // geometry follows width and detailsLeft
    [width, height, windowHeight, detailsLeft]
  );

  const details = useMemo(
    () =>
      media
        ? heroDetailsArt(heroDetailsModel(media, preparation, availability), {
            windowHeight,
            detailsWidth: geometry.detailsWidth,
            width,
          })
        : null,
    // geometry follows width and detailsLeft
    [availability, media, preparation, windowHeight, geometry.detailsWidth, width]
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
        ? heroDetailsArt(heroDetailsModel(upcomingMedia), {
            windowHeight,
            detailsWidth: geometry.detailsWidth,
            width,
          })
        : null,
    [upcomingMedia, windowHeight, geometry.detailsWidth, width]
  );
  const upcomingLogo = upcoming?.heroLogo ? artworkUrl(upcoming.heroLogo, 'logo', 500) : null;
  useEffect(() => {
    if (upcomingLogo) parent?.renderer.preload(upcomingLogo, HERO_DETAILS.logoMaxWidth);
  }, [parent, upcomingLogo]);
  const shown = useRef<{
    details: HeroDetailsArt;
    media: MediaDto;
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
      const loaded = logoUrl ? painter.load(logoUrl, HERO_DETAILS.logoMaxWidth) : 'failed';
      const useLogo = Boolean(logoUrl) && loaded !== 'failed';
      // Shown only whole: every text, and the logo settled (or the title, the logo failing)
      const measured = details.texts(useLogo).map(spec => painter.measure(spec));
      const ready =
        measured.every(Boolean) &&
        (!useLogo || loaded === 'ready') &&
        (!logoPending || logoWaitOver);
      if (ready) shown.current = { details, media: media!, useLogo, logoUrl };
      // The same title's details changing (its quality known) keep the last whole ones meanwhile
      const current = ready ? shown.current : shown.current?.media === media ? shown.current : null;
      if (moving || !current) detailsNode.animate('opacity', 0, DETAILS_FADE_MS, ease);
      if (!current) return;
      current.details.draw(painter, {
        left: detailsLeft,
        bottom: detailsBottom,
        logoUrl: current.useLogo ? current.logoUrl : null,
      });
      if (!moving) detailsNode.animate('opacity', 1, DETAILS_FADE_MS, ease);
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
  layer: BackdropLayerState;
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
      if (!paused) node.animate('opacity', 1, BACKDROP_FADE_MS, ease);
      // Interrupted: shown whole now (a set ends the animation), the layers under it drop below
      else if (node.animations.opacity) node.set({ opacity: 1 });
    }
    mounted.current = true;
    if (!visible) return;
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
      painter.image(layer.url, rect.x, rect.y, rect.w, rect.h, { fit: 'contain', fade: false });
    },
    [layer.url, rect]
  );
  return null;
}

/** The hidden DOM for assistive technology: the hero's text, announced as it changes. */
function GlHeroText({
  media,
  preparation,
  availability,
}: {
  media: MediaDto | null;
  preparation: PreloadPreparationSnapshot | null;
  availability: SourceAvailability;
}) {
  if (!media) return null;
  const details = heroDetailsModel(media, preparation, availability);
  const status = details.status;
  const statusLabel =
    status?.kind === 'quality'
      ? status.label
      : status?.kind === 'unavailable'
        ? 'No source'
        : status?.kind === 'checking'
          ? 'Checking…'
          : null;
  return (
    <header
      aria-live="polite"
      style={{ position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none' }}
    >
      <h1>{details.title}</h1>
      <p>
        {[...details.metadata, details.rating ? `${details.rating} stars` : '']
          .filter(Boolean)
          .join(', ')}
      </p>
      {details.genres && <p>{details.genres}</p>}
      <p>{details.overview}</p>
      {statusLabel && <p role="status">{statusLabel}</p>}
    </header>
  );
}
