import type { AppState } from '@app/hooks/useAppState';
import { MotionConfig } from 'framer-motion';
import { useEffect, useRef } from 'react';
import styled, { css, keyframes } from 'styled-components';

import {
  INTRO_LOGO_HEIGHT_NARROW_PX,
  INTRO_LOGO_HEIGHT_PX,
  NARROW_MAX_WIDTH_PX,
} from './logoGeometry';

const logoSvgUrl = '/assets/images/logo.svg';

/**
 * The centred logo breathes while the app loads. It animates `scale`, not `transform`, so the
 * position transform still transitions smoothly when the pulse stops and the logo moves.
 */
/** How long a stopped pulse takes to ease back to full size before the intro takes over. */
const PULSE_SETTLE_MS = 150;

const loadingPulse = keyframes`
  0%, 100% {
    transform: translate(-50%, -50%) scale(1) ;
    opacity: 1;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.1);
    opacity: 0.8;
  }
`;

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
  $pulsing: boolean;
}>`
  display: block;
  position: fixed;
  z-index: ${({ $aboveIntro }) => ($aboveIntro ? 1003 : 1002)};
  pointer-events: none;
  visibility: ${({ $visible }) => ($visible ? 'visible' : 'hidden')};
  transition: ${({ $disableMotion }) => ($disableMotion ? 'none' : 'all 0.4s ease-in-out')};

  transform: ${({ $home, $intro }) =>
    $home ? 'none' : $intro ? 'translate(-50%, -50%)' : 'translate(-50%, 0%)'};
  left: ${({ $home }) => ($home ? '5vw' : '50%')};

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

  ${({ $intro, $pulsing }) =>
    $intro &&
    $pulsing &&
    css`
      animation: ${loadingPulse} 1.4s ease-in-out infinite;

      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    `}

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
  const motionDisabledRef = useRef(disableMotion);
  motionDisabledRef.current = disableMotion;
  const isPulsing = page === 'intro' && pulsing;

  // A stopped CSS animation snaps back to scale 1. Ease from wherever the pulse was instead,
  // so the intro (drawn at scale 1) starts exactly on top of the logo.
  useEffect(() => {
    if (isPulsing) return undefined;
    const image = imageRef.current;
    const computed = image ? getComputedStyle(image).scale : 'none';
    const from = computed === 'none' ? 1 : Number.parseFloat(computed);
    if (!image || !Number.isFinite(from) || Math.abs(from - 1) < 0.001) {
      settledRef.current?.();
      return undefined;
    }
    image.style.scale = String(from);
    // Keep the position transition: the logo may be moving to its page as the pulse stops.
    image.style.transition = `${
      motionDisabledRef.current ? '' : 'all 0.4s ease-in-out, '
    }scale ${PULSE_SETTLE_MS}ms ease-out`;
    let frame = window.requestAnimationFrame(() => {
      frame = 0;
      image.style.scale = '1';
    });
    const timer = window.setTimeout(() => {
      image.style.removeProperty('scale');
      image.style.removeProperty('transition');
      settledRef.current?.();
    }, PULSE_SETTLE_MS + 20);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      image.style.removeProperty('scale');
      image.style.removeProperty('transition');
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
        $pulsing={pulsing}
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
