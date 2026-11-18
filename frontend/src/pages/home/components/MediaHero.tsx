import { useEnsureBackdropFocusMutation } from '@features/media/api/media.api';
import { SourcePreparationStatus } from '@features/preload/ui/SourcePreparationStatus';
import type { MediaDto, PreloadPreparationSnapshot } from '@miauflix/backend';
import { builtForTizen, PALETTE } from '@shared/config/constants';
import {
  type BackdropFocus,
  type BackdropPositionContext,
  getBackdropPlacement,
} from '@shared/lib/backdrop-focus';
import { imagePreloader, URGENT } from '@shared/lib/image-preloader';
import { artworkUrl, formatRuntime, getMediaTitle } from '@shared/lib/media.utils';
import { MetadataDot, MetadataRating } from '@shared/ui/metadata/metadata.styles';
import { selectSourceAvailability } from '@store/slices/realtime';
import type { RootState } from '@store/store';
import {
  type ComponentProps,
  type FC,
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';

import {
  pushBackdrop,
  revealBackdrop,
  settleBackdrop,
  type StackedBackdrop,
} from '../backdrop-stack';
import {
  BACKDROP_OVERLAP_RATIO,
  getHeroBackdropLayout,
  getHeroTextGeometry,
  HERO_BACKDROP_LEFT_CSS,
  HERO_DETAILS_LEFT_CSS,
  HERO_DETAILS_WIDTH_CSS,
} from '../hero-backdrop-layout';
import { useMediaBoxSizes } from '../hooks/useMediaBoxSizes';
import { useRestingValue } from '../hooks/useRestingValue';

import StarIcon from '~icons/mdi/star';

interface BackdropLayerState {
  key: string;
  url: string;
  focus: BackdropFocus | null;
  imageWidth: number;
  imageHeight: number;
}

// The TV rasterizes in software: on their own layers the gradients and backdrops are painted once,
// instead of with every title change and every frame of a crossfade.
const tvLayer = (property: 'opacity' | 'transform') =>
  builtForTizen ? `will-change: ${property};` : '';

/**
 * The shade's geometry in pixels, on the TV. Chromium 69 resolves `var()` and `calc()` in a
 * gradient into new values on every restyle, and every rule styled-components inserts restyles
 * the page, so it repainted the whole shade (about 480 ms) each time; fixed values compare equal.
 */
type HeroShade = ReturnType<typeof getHeroTextGeometry>;
const px = (value: number) => `${Math.round(value * 100) / 100}px`;
const shadeAt = (shade: HeroShade | null, css: string, fromText: number, fromFree: number) =>
  shade ? px(fromText * shade.textRight + fromFree * shade.freeWidth) : css;

const Hero = styled.header<{ $shade: HeroShade | null }>`
  --hero-details-width: ${HERO_DETAILS_WIDTH_CSS};
  --hero-text-right: calc(${HERO_DETAILS_LEFT_CSS} + var(--hero-details-width));
  --hero-free-width: calc(100vw - var(--hero-text-right));
  position: absolute;
  inset: 0 0 auto;
  z-index: 1;
  height: 55vh;
  padding: 10vh 5vw 9vh ${HERO_DETAILS_LEFT_CSS};
  display: flex;
  align-items: flex-end;
  overflow: hidden;
  background: #000;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    ${tvLayer('transform')}
    background:
      radial-gradient(
        ellipse 72% 115% at
          ${({ $shade }) =>
      shadeAt($shade, 'calc(var(--hero-text-right) + var(--hero-free-width) * 0.7)', 1, 0.7)}
          0%,
        transparent 35%,
        rgba(0, 0, 0, 0.16) 51%,
        rgba(0, 0, 0, 0.78) 75%,
        #000 100%
      ),
      linear-gradient(
        90deg,
        #03050d 0%,
        /* Opaque up to the backdrop's left edge, so its edge never shows */
        #03050d
          ${({ $shade }) =>
      $shade
        ? px($shade.detailsLeft + $shade.detailsWidth * BACKDROP_OVERLAP_RATIO)
        : HERO_BACKDROP_LEFT_CSS},
        rgba(3, 5, 13, 0.96)
          ${({ $shade }) =>
      $shade
        ? px($shade.detailsLeft + $shade.detailsWidth * (BACKDROP_OVERLAP_RATIO + 0.08))
        : `calc(${HERO_BACKDROP_LEFT_CSS} + var(--hero-details-width) * 0.08)`},
        rgba(3, 5, 13, 0.35)
          ${({ $shade }) =>
      shadeAt($shade, 'calc(var(--hero-text-right) + var(--hero-free-width) * 0.14)', 1, 0.14)},
        transparent
          ${({ $shade }) =>
      shadeAt($shade, 'calc(var(--hero-text-right) + var(--hero-free-width) * 0.55)', 1, 0.55)}
      ),
      linear-gradient(0deg, #000 0%, rgba(0, 0, 0, 0.62) 17%, transparent 48%);
  }

  &::after {
    content: '';
    position: absolute;
    top: 39.5vh;
    left: ${({ $shade }) =>
      shadeAt($shade, 'calc(var(--hero-text-right) + var(--hero-free-width) * 0.285)', 1, 0.285)};
    right: 0;
    height: 15.5vh;
    z-index: 3;
    pointer-events: none;
    ${tvLayer('transform')}
    background: linear-gradient(181deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.5) 53%, #000 100%);
  }
`;

/** How long the details fade out, and in (see BACKDROP_REST_MS). */
const DETAILS_FADE_MS = 200;
/** The backdrop crossfade. */
const BACKDROP_FADE_MS = 400;

/**
 * Stacked in DOM order: a later layer fades in over the earlier ones. The image and opacity are
 * inline: as styled-components props every backdrop added a CSS class, and each inserted rule
 * restyles the whole page (about 60 ms a title on the TV).
 */
const BackdropLayer = styled.div`
  position: absolute;
  top: 0;
  left: ${HERO_BACKDROP_LEFT_CSS};
  right: 0;
  height: 55vh;
  z-index: 1;
  pointer-events: none;
  background-color: #000;
  background-repeat: no-repeat;
  transition: opacity ${BACKDROP_FADE_MS}ms ease;
  ${tvLayer('opacity')}

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Details = styled.div`
  width: var(--hero-details-width);
  position: relative;
  z-index: 4;
  transition: opacity ${DETAILS_FADE_MS}ms ease;
`;

const Logo = styled.img`
  max-width: min(28vw, 420px);
  max-height: 12vh;
  object-fit: contain;
  object-position: left bottom;
  margin-bottom: 1.5vh;
`;

const Title = styled.h1`
  margin: 0 0 1vh;
  font-size: clamp(32px, 5vh, 73.6px);
  line-height: 1.05;
  font-weight: 600;
  text-transform: none;
`;

const Metadata = styled.div`
  margin: 0 0 1vh;
  color: ${PALETTE.text.primary};
  font-size: clamp(13.6px, 2.1vh, 19.2px);
  font-weight: 500;
  display: flex;
  align-items: center;
`;

const BadgeGap = styled.span`
  width: 0.9em;
`;

const MetadataRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  @media (max-width: 860px) {
    flex-wrap: wrap;
    gap: 5.6px;
  }
`;

const MetadataBlock = styled.div`
  min-width: 0;
`;

const Overview = styled.p`
  max-width: 62ch;
  margin: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  font-size: clamp(14.4px, 2.3vh, 20.8px);
  line-height: 1.5;
`;

/**
 * Displays media details and crossfades loaded backdrops using supplied, cached, or requested focus.
 * Analysis failure uses right-center positioning; image load failure clears the active backdrop.
 * Null media renders an empty hero, and reduced-motion preferences disable the fade.
 */
interface MediaHeroProps {
  media: MediaDto | null;
  preparation?: PreloadPreparationSnapshot | null;
  onReady?: (mediaId: number | null) => void;
}

/** The hero only awaits its backdrop focus requests: their state never re-renders it. */
const NO_RESULT = {};
const IGNORE_RESULT = { selectFromResult: () => NO_RESULT };

/**
 * On the TV, as on Prime Video: a move fades the details out (DETAILS_FADE_MS); once the
 * selection has rested as long, the new title's details fade in and its image crossfades in
 * (BACKDROP_FADE_MS). Moves before that keep the hero as it is, details dark (a move during the
 * fade-in fades out again from where it is; one during the crossfade ends it on the new image).
 * Each new backdrop is a full-width layer to rasterize and upload, and each new set of details a
 * layout (or text textures), which cost frames during a move.
 */
const BACKDROP_REST_MS = DETAILS_FADE_MS;
/** The image queue's owner of the resting backdrop the hero waits for. */
const HERO_RESTING_OWNER = 'hero-resting';

/**
 * The hero logo for the displayed title, preferring current artwork from the store.
 */
function useHeroLogo(media: MediaDto | null) {
  const artwork = useSelector((state: RootState) =>
    media
      ? state.artwork.byMedia[`${media._type === 'movie' ? 'movie' : 'tv'}:${media.mediaId}`]
      : undefined
  );
  if (!media) return null;
  const current = artwork && artwork.artworkRevision >= (media.artworkRevision ?? 0);
  return current ? artwork.heroLogo : (media.heroLogo ?? media.logo);
}

/** Show the selected title, source status, and a backdrop that transitions after loading. */
export const MediaHero: FC<MediaHeroProps> = ({ media, preparation = null, onReady }) => {
  const mediaType = media?._type === 'movie' ? 'movie' : 'tv';
  const availability = useSelector(
    selectSourceAvailability(
      media?._type === 'movie' ? { kind: 'movie', mediaId: media.mediaId } : null
    )
  );
  const artwork = useSelector((state: RootState) =>
    media ? state.artwork.byMedia[`${mediaType}:${media.mediaId}`] : undefined
  );
  const selectedArtwork =
    artwork && artwork.artworkRevision >= (media?.artworkRevision ?? 0) ? artwork : media;
  // The details shown: the selection once it rested DETAILS_FADE_MS (the fade-out's length);
  // until then the previous ones, fading out (`moving`)
  const selectionKey = media ? `${media._type}:${media.mediaId}` : '';
  const detailsMedia = useRestingValue(media, selectionKey, builtForTizen ? DETAILS_FADE_MS : 0);
  const moving = detailsMedia !== media;
  // The next backdrop starts loading once the selection pauses half the fade-out:
  // a held burst loads none of the titles it passes, a single move still gets a head start
  const pausedMedia = useRestingValue(media, selectionKey, builtForTizen ? DETAILS_FADE_MS / 2 : 0);
  const detailsLogo = useHeroLogo(detailsMedia);
  const { media: backdropMedia, backdrop: selectedBackdrop } = useRestingValue(
    { media, backdrop: selectedArtwork?.backdrop },
    media ? `${media._type}:${media.mediaId}:${selectedArtwork?.backdrop ?? ''}` : '',
    builtForTizen ? BACKDROP_REST_MS : 0
  );
  // The effect below restarts on the title's identity, not on every new media object.
  const backdropMediaRef = useRef(backdropMedia);
  backdropMediaRef.current = backdropMedia;
  const [ensureBackdropFocus] = useEnsureBackdropFocusMutation(IGNORE_RESULT);
  const { margin } = useMediaBoxSizes();
  const heroRef = useRef<HTMLElement>(null);
  const [heroSize, setHeroSize] = useState({ width: 0, height: 0 });
  const [layers, setLayersState] = useState<StackedBackdrop<BackdropLayerState>[]>([]);
  const layersRef = useRef(layers);
  const nextLayerId = useRef(0);
  const settleTimers = useRef(new Set<number>());
  const setLayers = useCallback(
    (
      update: (
        stack: StackedBackdrop<BackdropLayerState>[]
      ) => StackedBackdrop<BackdropLayerState>[]
    ) => {
      const next = update(layersRef.current);
      // An empty stack stays the same array, so clearing twice does not re-render.
      if (!next.length && !layersRef.current.length) return;
      layersRef.current = next;
      setLayersState(next);
    },
    []
  );
  const settle = useCallback(
    (id: number) => setLayers(stack => settleBackdrop(stack, id)),
    [setLayers]
  );
  useEffect(() => {
    const timers = settleTimers.current;
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, []);
  const focusCacheRef = useRef(new Map<string, BackdropFocus>());
  const requestId = useRef(0);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return undefined;

    const updateSize = () =>
      setHeroSize({
        width: hero.clientWidth,
        height: hero.clientHeight,
      });
    updateSize();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateSize);
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    const shown = backdropMediaRef.current;
    if (shown?.mediaId === undefined || !selectedBackdrop) {
      setLayers(() => []);
      onReady?.(shown?.mediaId ?? null);
      return;
    }

    // The resting size replaces the moving one once the selection rests, loaded while idle; a
    // title whose resting backdrop is already loaded shows it at once
    const restingUrl = artworkUrl(selectedBackdrop, 'backdrop-resting');
    const url = imagePreloader.isLoaded(restingUrl)
      ? restingUrl
      : artworkUrl(selectedBackdrop, 'backdrop');
    const titleKey = `${shown._type}:${shown.mediaId}`;
    const key = `${titleKey}:${url}`;
    let cancelled = false;
    const current = () => !cancelled && currentRequest === requestId.current;

    const show = (next: BackdropLayerState) => {
      if (layersRef.current[layersRef.current.length - 1]?.backdrop.key === next.key) return;
      const id = ++nextLayerId.current;
      setLayers(stack => pushBackdrop(stack, next, id));
      // Fade in from the next frame; transitionend settles the layer, or this timer if the
      // fade never runs (reduced motion, a hidden page).
      requestAnimationFrame(() => {
        setLayers(stack => revealBackdrop(stack, id));
        const timer = window.setTimeout(() => {
          settleTimers.current.delete(timer);
          settle(id);
        }, BACKDROP_FADE_MS + 50);
        settleTimers.current.add(timer);
      });
    };

    const prepare = async (): Promise<void> => {
      if (shown.backdropFocus) focusCacheRef.current.set(key, shown.backdropFocus);
      const focusPromise = shown.backdropFocus
        ? Promise.resolve(shown.backdropFocus)
        : focusCacheRef.current.has(key)
          ? Promise.resolve(focusCacheRef.current.get(key)!)
          : ensureBackdropFocus({
              mediaType: shown._type === 'movie' ? 'movie' : 'tv',
              mediaId: shown.mediaId,
            })
              .unwrap()
              .then(result => {
                focusCacheRef.current.set(key, result.backdropFocus);
                return result.backdropFocus;
              })
              .catch(() => null);
      // Decoded before the swap; a backdrop the row already preloaded resolves at once.
      const imagePromise = imagePreloader.load(url, URGENT);
      const focus = await focusPromise;
      let imageSize: { width: number; height: number };
      try {
        imageSize = await imagePromise;
      } catch {
        if (current()) {
          setLayers(() => []);
          onReady?.(shown.mediaId);
        }
        return;
      }

      if (!current()) return;
      onReady?.(shown.mediaId);
      show({ key, url, focus, imageWidth: imageSize.width, imageHeight: imageSize.height });
      if (url === restingUrl) return;
      imagePreloader.loadWhenIdle(HERO_RESTING_OWNER, restingUrl).then(
        resting => {
          if (!current()) return;
          show({
            key: `${titleKey}:${restingUrl}`,
            url: restingUrl,
            focus,
            imageWidth: resting.width,
            imageHeight: resting.height,
          });
        },
        () => undefined
      );
    };

    void prepare();
    return () => {
      cancelled = true;
      imagePreloader.clear(HERO_RESTING_OWNER);
    };
  }, [
    ensureBackdropFocus,
    onReady,
    setLayers,
    settle,
    selectedBackdrop,
    backdropMedia?.backdropFocus,
    backdropMedia?._type,
    backdropMedia?.mediaId,
  ]);

  // The next backdrop (its image and focus) loads once the selection pauses, like its details,
  // so its crossfade starts as the details finish fading out instead of after the download
  const pausedBackdrop =
    moving && media && pausedMedia === media ? selectedArtwork?.backdrop : null;
  useEffect(() => {
    if (!pausedBackdrop || !media) return;
    const restingUrl = artworkUrl(pausedBackdrop, 'backdrop-resting');
    const url = imagePreloader.isLoaded(restingUrl)
      ? restingUrl
      : artworkUrl(pausedBackdrop, 'backdrop');
    imagePreloader.load(url, URGENT).catch(() => undefined);
    const key = `${media._type}:${media.mediaId}:${url}`;
    if (media.backdropFocus || focusCacheRef.current.has(key)) return;
    ensureBackdropFocus({
      mediaType: media._type === 'movie' ? 'movie' : 'tv',
      mediaId: media.mediaId,
    })
      .unwrap()
      .then(result => focusCacheRef.current.set(key, result.backdropFocus))
      .catch(() => undefined);
    // Once per paused title
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausedBackdrop, media?.mediaId, media?._type]);

  const layout = getHeroBackdropLayout(heroSize.width, margin);
  // The hero spans the viewport (`100vw` in the CSS version)
  const shade = useMemo(
    () => (builtForTizen ? getHeroTextGeometry(window.innerWidth, margin) : null),
    [margin]
  );
  const placementFor = (layer: BackdropLayerState) => {
    const context: BackdropPositionContext = {
      imageWidth: layer.imageWidth,
      imageHeight: layer.imageHeight,
      containerWidth: layout?.width ?? 0,
      containerHeight: heroSize.height,
      targetX: layout?.targetX,
      targetY: layout?.targetY,
      maxZoom: 1.5,
    };
    const placement = getBackdropPlacement(layer.focus, context);
    return { backgroundPosition: placement.position, backgroundSize: placement.size };
  };

  if (!media) return <Hero ref={heroRef} $shade={shade} aria-hidden="true" />;
  return (
    <Hero ref={heroRef} $shade={shade} aria-live="polite">
      {layers.map(layer => (
        <BackdropLayer
          key={layer.id}
          style={{
            ...placementFor(layer.backdrop),
            backgroundImage: layer.backdrop.url
              ? `url(${JSON.stringify(layer.backdrop.url)})`
              : 'none',
            opacity: layer.visible ? 1 : 0,
          }}
          onTransitionEnd={() => settle(layer.id)}
          aria-hidden="true"
        />
      ))}
      {detailsMedia && (
        <HeroDetails
          media={detailsMedia}
          heroLogo={detailsLogo}
          preparation={preparation}
          availability={availability}
          hidden={moving}
        />
      )}
    </Hero>
  );
};

/**
 * The title, metadata and overview. Memoized: each move swaps the backdrop layers three times
 * (added, faded in, settled), and none of those changes the text.
 */
const HeroDetails = memo(function HeroDetails({
  media,
  heroLogo,
  preparation,
  availability,
  hidden,
}: {
  hidden: boolean;
  media: MediaDto;
  heroLogo: string | null | undefined;
  preparation: ComponentProps<typeof SourcePreparationStatus>['preparation'];
  availability: ComponentProps<typeof SourcePreparationStatus>['availability'];
}) {
  const date = media._type === 'movie' ? media.releaseDate : media.firstAirDate;
  const metadata = [
    media._type === 'movie' && media.runtime ? formatRuntime(media.runtime) : '',
    date?.slice(0, 4),
  ].filter(Boolean);
  const rating = media.rating ? media.rating.toFixed(1) : null;
  return (
    <Details style={{ opacity: hidden ? 0 : 1 }}>
      {heroLogo ? (
        <Logo decoding="async" src={artworkUrl(heroLogo, 'logo', 500)} alt={getMediaTitle(media)} />
      ) : (
        <Title>{getMediaTitle(media)}</Title>
      )}
      <MetadataRow>
        <MetadataBlock>
          <Metadata>
            {metadata.map((text, index) => (
              <Fragment key={index}>
                {index > 0 && <MetadataDot />}
                <span>{text}</span>
              </Fragment>
            ))}
            {rating && (
              <>
                {metadata.length > 0 && <MetadataDot />}
                <MetadataRating>
                  <StarIcon aria-hidden="true" />
                  {rating}
                </MetadataRating>
              </>
            )}
            <BadgeGap />
            <SourcePreparationStatus
              mediaKind={media._type}
              mode="browse"
              preparation={preparation}
              availability={availability}
            />
          </Metadata>
          {media.genres.length > 0 && <Metadata>{media.genres.join(' · ')}</Metadata>}
        </MetadataBlock>
      </MetadataRow>
      <Overview>{media.overview}</Overview>
    </Details>
  );
});
