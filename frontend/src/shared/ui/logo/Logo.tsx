import type { AppState } from '@app/hooks/useAppState';
import { MotionConfig } from 'framer-motion';
import { useEffect, useRef } from 'react';
import styled from 'styled-components';

import {
  INTRO_LOGO_HEIGHT_NARROW_PX,
  INTRO_LOGO_HEIGHT_PX,
  NARROW_MAX_WIDTH_PX,
} from './logoGeometry';

const logoSvgUrl = `${import.meta.env.BASE_URL}assets/images/logo.svg`;

/**
 * The centred logo breathes while the app loads. It animates `scale`, not `transform`, so the
 * position transform still transitions smoothly when the pulse stops and the logo moves. The
 * origin is the box's top-left corner, which `translate(-50%, -50%)` puts at the logo's centre.
 */
const PULSE_FRAME = { transformOrigin: '0 0' };
const PULSE_KEYFRAMES: Keyframe[] = [
  { ...PULSE_FRAME, scale: '1', opacity: 1 },
  { ...PULSE_FRAME, scale: '1.1', opacity: 0.8 },
  { ...PULSE_FRAME, scale: '1', opacity: 1 },
];
const PULSE_MS = 1400;
/** How long a stopped pulse takes to ease back to full size before the intro takes over. */
const PULSE_SETTLE_MS = 150;

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Admin creation (`initial_setup`) uses a smaller mark */
const setupScale = 1;

const LogoImage = styled.img<{
  $setup: boolean;
  $configuration: boolean;
  $home: boolean;
  $intro: boolean;
  $disableMotion: boolean;
  $visible: boolean;
  $aboveIntro: boolean;
}>`
  display: block;
  position: fixed;
  z-index: ${({ $aboveIntro }) => ($aboveIntro ? 1003 : 1002)};
  pointer-events: none;
  visibility: ${({ $visible }) => ($visible ? 'visible' : 'hidden')};
  transition: ${({ $disableMotion }) => ($disableMotion ? 'none' : 'all 0.4s ease-in-out')};

  transform: ${({ $home, $intro }) =>
    $home ? 'none' : $intro ? 'translate(-50%, -50%)' : 'translate(-50%, 0%)'};
  left: ${({ $home }) => ($home ? 'var(--home-content-left, 5vw)' : '50%')};

  body[data-miauflix-details='true'] & {
    left: 8vw;
  }

  body[data-miauflix-player='true'] & {
    display: none;
  }

  /* Desktop */
  top: ${({ $home, $configuration, $intro }) =>
    $home ? '3vh' : $intro ? '50%' : $configuration ? '24px' : 'calc(50% - 380px)'};
  height: ${({ $setup, $configuration }) =>
    $configuration ? '56px' : $setup ? `${130 * setupScale}px` : '130px'};

  ${({ $intro }) => $intro && `height: ${INTRO_LOGO_HEIGHT_PX}px;`}

  ${({ $home }) =>
    $home &&
    `
      width: 14.5vh;
      height: 4vh;
    `}

  /* Mobile */
  @media (max-width: ${NARROW_MAX_WIDTH_PX}px) {
    top: ${({ $home, $configuration, $intro }) =>
      $home ? '3vh' : $intro ? '50%' : $configuration ? '16px' : '50px'};
    height: ${({ $home, $setup, $configuration, $intro }) =>
      $home
        ? '4vh'
        : $intro
          ? `${INTRO_LOGO_HEIGHT_NARROW_PX}px`
          : $configuration
            ? '48px'
            : $setup
              ? `${70 * setupScale}px`
              : '70px'};

    body[data-miauflix-details='true'] & {
      left: 30vw;
    }
  }
`;

const ConfigurationHeaderBackdrop = styled.div`
  position: fixed;
  inset: 0 0 auto;
  height: 104px;
  background-color: #0a0d0f;
  z-index: 1001;

  @media (max-width: ${NARROW_MAX_WIDTH_PX}px) {
    height: 80px;
  }
`;

export const Logo = ({
  page,
  disableMotion = false,
  visible = true,
  aboveIntro = false,
  pulsing = false,
  onPulseSettled,
  onPositionTransitionEnd,
}: {
  page?: AppState | 'intro';
  disableMotion?: boolean;
  visible?: boolean;
  aboveIntro?: boolean;
  /** Pulse while centred (loading); only applies to the intro position. */
  pulsing?: boolean;
  /** Called once the logo is back at full size after `pulsing` turns off (or was never on). */
  onPulseSettled?: () => void;
  onPositionTransitionEnd?: () => void;
}) => {
  const imageRef = useRef<HTMLImageElement>(null);
  const settledRef = useRef(onPulseSettled);
  settledRef.current = onPulseSettled;
  const isPulsing = page === 'intro' && pulsing;

  // A cancelled animation snaps back to scale 1. Ease from wherever the pulse was instead,
  // so the intro (drawn at scale 1) starts exactly on top of the logo.
  const settlingRef = useRef<Animation | null>(null);
  useEffect(() => {
    const image = imageRef.current;
    if (!isPulsing) {
      const settling = settlingRef.current;
      if (!settling) {
        settledRef.current?.();
        return undefined;
      }
      let cancelled = false;
      settling.finished
        .catch(() => undefined)
        .then(() => {
          if (cancelled) return;
          settlingRef.current = null;
          settledRef.current?.();
        });
      return () => {
        cancelled = true;
      };
    }
    if (!image || typeof image.animate !== 'function' || prefersReducedMotion()) return undefined;
    settlingRef.current?.cancel();
    settlingRef.current = null;
    const pulse = image.animate(PULSE_KEYFRAMES, {
      duration: PULSE_MS,
      easing: 'ease-in-out',
      iterations: Infinity,
    });
    return () => {
      // Read where the pulse is while it still runs, then ease from there to full size.
      const computed = getComputedStyle(image);
      const scale = Number.parseFloat(computed.scale);
      const opacity = Number.parseFloat(computed.opacity);
      pulse.cancel();
      if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.001) return;
      settlingRef.current = image.animate(
        [
          { ...PULSE_FRAME, scale: String(scale), opacity: Number.isFinite(opacity) ? opacity : 1 },
          { ...PULSE_FRAME, scale: '1', opacity: 1 },
        ],
        { duration: PULSE_SETTLE_MS, easing: 'ease-out' }
      );
    };
  }, [isPulsing]);

  const isSetup = page === 'initial_setup';
  const isConfiguration = page === 'config' || page === 'config_wizard';
  const isHome = page === 'home';
  const isIntro = page === 'intro';

  return (
    <MotionConfig transition={{ duration: 0.4 }}>
      {isConfiguration && <ConfigurationHeaderBackdrop aria-hidden="true" />}
      <LogoImage
        ref={imageRef}
        $setup={isSetup}
        $configuration={isConfiguration}
        $home={isHome}
        $intro={isIntro}
        $disableMotion={disableMotion}
        $visible={visible}
        $aboveIntro={aboveIntro}
        data-pulsing={isIntro && pulsing ? 'true' : undefined}
        src={logoSvgUrl}
        alt="Miauflix logo"
        onTransitionEnd={event => {
          if (event.propertyName === 'top') onPositionTransitionEnd?.();
        }}
      />
    </MotionConfig>
  );
};
