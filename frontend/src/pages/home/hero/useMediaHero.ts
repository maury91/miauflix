import { useEnsureBackdropFocusMutation } from '@features/media/api/media.api';
import type { MediaDto, PreloadPreparationSnapshot } from '@miauflix/backend';
import { builtForTizen } from '@shared/config/constants';
import type { GlParent, GlRenderer } from '@shared/design-system/gl';
import type { BackdropFocus } from '@shared/lib/backdrop-focus';
import { imagePreloader, URGENT } from '@shared/lib/image-preloader';
import { artworkUrl } from '@shared/lib/media.utils';
import { selectSourceAvailability } from '@store/slices/realtime';
import type { RootState } from '@store/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import {
  dropBackdrop,
  pushBackdrop,
  revealBackdrop,
  settleBackdrop,
  type StackedBackdrop,
} from '../backdrop-stack';
import { useMediaBoxSizes } from '../hooks/useMediaBoxSizes';
import { useRestingValue } from '../hooks/useRestingValue';
import { BACKDROP_FADE_MS, BACKDROP_REST_MS, DETAILS_FADE_MS } from './heroMotion';

/** One backdrop in the crossfade stack, with its focus and size (for its placement). */
export interface BackdropLayerState {
  key: string;
  url: string;
  focus: BackdropFocus | null;
  imageWidth: number;
  imageHeight: number;
}

export interface MediaHeroProps {
  media: MediaDto | null;
  preparation?: PreloadPreparationSnapshot | null;
  onReady?: (mediaId: number | null) => void;
}

/** The hero only awaits its backdrop focus requests: their state never re-renders it. */
const NO_RESULT = {};
const IGNORE_RESULT = { selectFromResult: () => NO_RESULT };

/** The image queue's owner of the resting backdrop the hero waits for. */
const HERO_RESTING_OWNER = 'hero-resting';

/**
 * The hero logo for a title (the artwork store's, once current), and whether it is still being
 * made: a logo arriving after the details would replace the title text (a flash).
 */
function useHeroLogo(media: MediaDto | null) {
  const artwork = useSelector((state: RootState) =>
    media
      ? state.artwork.byMedia[`${media._type === 'movie' ? 'movie' : 'tv'}:${media.mediaId}`]
      : undefined
  );
  if (!media) return { heroLogo: null, pending: false };
  const current = artwork && artwork.artworkRevision >= (media.artworkRevision ?? 0);
  return current
    ? { heroLogo: artwork.heroLogo, pending: artwork.heroLogoStatus === 'pending' }
    : { heroLogo: media.heroLogo ?? media.logo, pending: media.heroLogoStatus === 'pending' };
}

/** How long the intro waits for the GL hero's backdrop texture before showing Home anyway. */
const GL_READY_TIMEOUT_MS = 3000;

/** How long a backdrop waits for its focus point (fetched, can be analysed first) before showing. */
const BACKDROP_FOCUS_WAIT_MS = 1500;

/**
 * Resolves once the surface's texture for `src` is drawable or failed (the hero then draws its
 * fallback), or after GL_READY_TIMEOUT_MS. At once outside a GL surface.
 */
function glImageSettled(renderer: GlRenderer | undefined, src: string, width: number) {
  return new Promise<void>(resolve => {
    if (!renderer) return resolve();
    renderer.preload(src, width);
    const settled = () => renderer.imageStatus(src) !== 'loading';
    if (settled()) return resolve();
    // Declared first: done may run (a notice) as soon as it subscribes
    let unsubscribe = () => {};
    let timer = 0;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      unsubscribe();
      window.clearTimeout(timer);
      resolve();
    };
    timer = window.setTimeout(done, GL_READY_TIMEOUT_MS);
    unsubscribe = renderer.subscribeImage(src, () => {
      if (settled()) done();
    });
    if (finished) unsubscribe();
  });
}

/**
 * What both of MediaHero's views need: the details shown (the selection once it rested), where it
 * is heading, the source's availability, and the backdrop crossfade stack, loaded with its focus.
 * `gl`: the GL parent, when the hero is drawn (the renderer then preloads and settles layers).
 */
export function useMediaHero(
  { media, preparation = null, onReady }: MediaHeroProps,
  gl: GlParent | null
) {
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
  // The next title's texts and logo start loading once the selection pauses half the fade-out:
  // a held burst loads none of the titles it passes, a single move still gets a head start
  const pausedMedia = useRestingValue(media, selectionKey, builtForTizen ? DETAILS_FADE_MS / 2 : 0);
  const selectedLogo = useHeroLogo(media);
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
  const { margin, windowHeight } = useMediaBoxSizes();
  // In GL the renderer loads the next backdrop, and settles layers when their fade lands
  const glRef = useRef(gl);
  glRef.current = gl;
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
  const drop = useCallback(
    (id: number) => setLayers(stack => dropBackdrop(stack, id)),
    [setLayers]
  );
  useEffect(() => {
    const timers = settleTimers.current;
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, []);
  const focusCacheRef = useRef(new Map<string, BackdropFocus>());
  const requestId = useRef(0);

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
        // GL settles the layer when its fade lands, after its texture is up (can be >400 ms)
        if (glRef.current) return;
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
      // A slow focus request doesn't hold the backdrop (or Home's readiness): past the wait it
      // shows centred, and the focus, cached once it arrives, serves the title's next showing
      const boundedFocus = Promise.race([
        focusPromise,
        new Promise<null>(resolve =>
          window.setTimeout(() => resolve(null), BACKDROP_FOCUS_WAIT_MS)
        ),
      ]);
      // Decoded before the swap; a backdrop the row already preloaded resolves at once.
      const imagePromise = imagePreloader.load(url, URGENT);
      let focus: BackdropFocus | null;
      let imageSize: { width: number; height: number };
      try {
        [focus, imageSize] = await Promise.all([boundedFocus, imagePromise]);
      } catch {
        if (current()) {
          setLayers(() => []);
          onReady?.(shown.mediaId);
        }
        return;
      }

      if (!current()) return;
      show({ key, url, focus, imageWidth: imageSize.width, imageHeight: imageSize.height });
      const gl = glRef.current;
      if (gl) {
        await glImageSettled(gl.renderer, url, Math.min(imageSize.width, gl.width * 1.5));
        if (!current()) return;
      }
      onReady?.(shown.mediaId);
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
    const gl = glRef.current;
    if (gl) gl.renderer.preload(url, gl.width);
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

  return {
    preparation,
    availability,
    /** The details shown, and whether the selection moved on from them (they fade out). */
    detailsMedia,
    moving,
    /** Where the selection is heading, once it paused: its texts and logo load meanwhile. */
    upcoming:
      moving && media && pausedMedia === media ? { media, heroLogo: selectedLogo.heroLogo } : null,
    detailsLogo,
    layers,
    settle,
    drop,
    margin,
    windowHeight,
  };
}
