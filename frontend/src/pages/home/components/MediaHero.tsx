import { useEnsureBackdropFocusMutation } from '@features/media/api/media.api';
import type { MediaDto } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import { type FC, useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import {
  type BackdropFocus,
  type BackdropPositionContext,
  getBackdropPosition,
} from '../backdrop-focus';
import { getImageUrl, getMediaTitle } from '../media.utils';

const BACKDROP_LAYER_LEFT_RATIO = 0.32;
const BACKDROP_LAYER_WIDTH_RATIO = 1 - BACKDROP_LAYER_LEFT_RATIO;
const SAFE_BACKDROP_SCREEN_X = 0.76;
const SAFE_BACKDROP_TARGET_X =
  (SAFE_BACKDROP_SCREEN_X - BACKDROP_LAYER_LEFT_RATIO) / BACKDROP_LAYER_WIDTH_RATIO;
const SAFE_BACKDROP_TARGET_Y = 0.5;

interface BackdropLayerState {
  key: string;
  url: string;
  focus: BackdropFocus | null;
  imageWidth: number;
  imageHeight: number;
}

const Hero = styled.header`
  position: absolute;
  inset: 0 0 auto;
  z-index: 1;
  height: 55vh;
  padding: 10vh 5vw 9vh 7vw;
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
    background:
      radial-gradient(
        ellipse 72% 115% at 88% 0%,
        transparent 35%,
        rgba(0, 0, 0, 0.16) 51%,
        rgba(0, 0, 0, 0.78) 75%,
        #000 100%
      ),
      linear-gradient(
        90deg,
        #03050d 0%,
        rgba(3, 5, 13, 0.96) 28%,
        rgba(3, 5, 13, 0.35) 58%,
        transparent 78%
      ),
      linear-gradient(0deg, #000 0%, rgba(0, 0, 0, 0.62) 17%, transparent 48%);
  }

  &::after {
    content: '';
    position: absolute;
    top: 39.5vh;
    left: 65vw;
    right: 0;
    height: 15.5vh;
    z-index: 3;
    pointer-events: none;
    background: linear-gradient(181deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.5) 53%, #000 100%);
  }
`;

const BackdropLayer = styled.div<{
  $url: string;
  $position: string;
  $visible: boolean;
  $top: boolean;
}>`
  position: absolute;
  top: 0;
  left: 32vw;
  right: 0;
  height: 55vh;
  z-index: ${({ $top }) => ($top ? 1 : 0)};
  pointer-events: none;
  background:
    ${({ $url, $position }) =>
      $url ? `url(${JSON.stringify($url)}) ${$position} / cover no-repeat` : 'none'},
    #000;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity 350ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Details = styled.div`
  width: min(44vw, 720px);
  position: relative;
  z-index: 4;
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
  font-size: clamp(2rem, 5vh, 4.6rem);
  line-height: 1.05;
  font-weight: 600;
  text-transform: none;
`;

const Metadata = styled.p`
  margin: 0 0 1vh;
  color: ${PALETTE.text.primary};
  font-size: clamp(0.85rem, 2.1vh, 1.2rem);
  font-weight: 500;
`;

const Overview = styled.p`
  max-width: 62ch;
  margin: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  font-size: clamp(0.9rem, 2.3vh, 1.3rem);
  line-height: 1.5;
`;

/**
 * Displays media details and crossfades loaded backdrops using supplied, cached, or requested focus.
 * Analysis failure uses right-center positioning; image load failure clears the active backdrop.
 * Null media renders an empty hero, and reduced-motion preferences disable the fade.
 */
export const MediaHero: FC<{ media: MediaDto | null }> = ({ media }) => {
  const [ensureBackdropFocus] = useEnsureBackdropFocusMutation();
  const heroRef = useRef<HTMLElement>(null);
  const [heroSize, setHeroSize] = useState({ width: 0, height: 0 });
  const [activeBackdrop, setActiveBackdrop] = useState<BackdropLayerState | null>(null);
  const [incomingBackdrop, setIncomingBackdrop] = useState<BackdropLayerState | null>(null);
  const [incomingVisible, setIncomingVisible] = useState(false);
  const activeBackdropRef = useRef<BackdropLayerState | null>(null);
  const focusCacheRef = useRef(new Map<string, BackdropFocus>());
  const requestId = useRef(0);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return undefined;

    const updateSize = () =>
      setHeroSize({
        width: hero.clientWidth * BACKDROP_LAYER_WIDTH_RATIO,
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
    setIncomingBackdrop(null);
    setIncomingVisible(false);
    if (!media?.backdrop) {
      setActiveBackdrop(null);
      activeBackdropRef.current = null;
      return;
    }

    const url = getImageUrl(media.backdrop, 'original');
    const key = `${media._type}:${media.mediaId}:${url}`;
    let cancelled = false;

    const prepare = async (): Promise<void> => {
      if (media.backdropFocus) focusCacheRef.current.set(key, media.backdropFocus);
      const focusPromise = media.backdropFocus
        ? Promise.resolve(media.backdropFocus)
        : focusCacheRef.current.has(key)
          ? Promise.resolve(focusCacheRef.current.get(key)!)
          : ensureBackdropFocus({
              mediaType: media._type === 'movie' ? 'movie' : 'tv',
              mediaId: media.mediaId,
            })
              .unwrap()
              .then(result => {
                focusCacheRef.current.set(key, result.backdropFocus);
                return result.backdropFocus;
              })
              .catch(() => null);
      const imagePromise = new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
          if (typeof image.decode === 'function') {
            void image
              .decode()
              .then(() => resolve(dimensions))
              .catch(() => resolve(dimensions));
          } else {
            resolve(dimensions);
          }
        };
        image.onerror = () => reject(new Error('backdrop_load_failed'));
        image.src = url;
      });
      const focus = await focusPromise;
      let imageSize: { width: number; height: number };
      try {
        imageSize = await imagePromise;
      } catch {
        if (!cancelled && currentRequest === requestId.current) {
          activeBackdropRef.current = null;
          setActiveBackdrop(null);
        }
        return;
      }

      if (cancelled || currentRequest !== requestId.current) return;
      const next: BackdropLayerState = {
        key,
        url,
        focus,
        imageWidth: imageSize.width,
        imageHeight: imageSize.height,
      };
      if (!activeBackdropRef.current) {
        activeBackdropRef.current = next;
        setActiveBackdrop(next);
        return;
      }
      if (activeBackdropRef.current.key === key) return;
      setIncomingBackdrop(next);
      requestAnimationFrame(() => {
        if (!cancelled && currentRequest === requestId.current) setIncomingVisible(true);
      });
    };

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [ensureBackdropFocus, media]);

  const promoteIncoming = useCallback(() => {
    if (!incomingBackdrop) return;
    activeBackdropRef.current = incomingBackdrop;
    setActiveBackdrop(incomingBackdrop);
    setIncomingBackdrop(null);
    setIncomingVisible(false);
  }, [incomingBackdrop]);

  useEffect(() => {
    if (!incomingBackdrop || !incomingVisible) return;
    const timer = window.setTimeout(promoteIncoming, 400);
    return () => window.clearTimeout(timer);
  }, [incomingBackdrop, incomingVisible, promoteIncoming]);

  const positionFor = (layer: BackdropLayerState): string => {
    const context: BackdropPositionContext = {
      imageWidth: layer.imageWidth,
      imageHeight: layer.imageHeight,
      containerWidth: heroSize.width,
      containerHeight: heroSize.height,
      targetX: SAFE_BACKDROP_TARGET_X,
      targetY: SAFE_BACKDROP_TARGET_Y,
    };
    return getBackdropPosition(layer.focus, context);
  };

  if (!media) return <Hero ref={heroRef} aria-hidden="true" />;
  const date = media._type === 'movie' ? media.releaseDate : media.firstAirDate;
  const metadata = [
    media._type === 'movie' && media.runtime ? `${media.runtime} min` : '',
    date?.slice(0, 4),
    media.rating ? `★ ${media.rating.toFixed(1)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Hero ref={heroRef} aria-live="polite">
      {activeBackdrop && (
        <BackdropLayer
          $url={activeBackdrop.url}
          $position={positionFor(activeBackdrop)}
          $visible
          $top={!incomingBackdrop}
          aria-hidden="true"
        />
      )}
      {incomingBackdrop && (
        <BackdropLayer
          $url={incomingBackdrop.url}
          $position={positionFor(incomingBackdrop)}
          $visible={incomingVisible}
          $top
          onTransitionEnd={promoteIncoming}
          aria-hidden="true"
        />
      )}
      <Details>
        {media.logo ? (
          <Logo src={getImageUrl(media.logo)} alt={getMediaTitle(media)} />
        ) : (
          <Title>{getMediaTitle(media)}</Title>
        )}
        <Metadata>{metadata}</Metadata>
        {media.genres.length > 0 && <Metadata>{media.genres.join(' · ')}</Metadata>}
        <Overview>{media.overview}</Overview>
      </Details>
    </Hero>
  );
};
