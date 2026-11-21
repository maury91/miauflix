import type { AppState } from '@app/hooks/useAppState';
import { MotionConfig } from 'framer-motion';
import { useEffect, useRef } from 'react';

import { useT } from '../../i18n';
import * as styles from './logo.css';

const logoSvgUrl = `${import.meta.env.BASE_URL}assets/images/logo.svg`;

/**
 * The centred logo breathes while the app loads. It animates `scale`, not `transform`, so the
 * position transform still transitions smoothly when the pulse stops and the logo moves. The
 * origin is the box's top-left corner, which `translate(-50%, -50%)` puts at the logo's centre.
 */
const PULSE_FRAME = { transformOrigin: '0 0' };
/**
 * Browsers without the `scale` property (the Samsung TV's Chromium 69) pulse `transform` instead,
 * repeating the centred position: scaling before the translate draws the same thing.
 */
const supportsScaleProperty = () =>
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('scale', '1');
const pulseFrame = (scale: number, opacity: number): Keyframe =>
  supportsScaleProperty()
    ? { ...PULSE_FRAME, scale: String(scale), opacity }
    : { ...PULSE_FRAME, transform: `scale(${scale}) translate(-50%, -50%)`, opacity };
/** The pulse's current scale, from whichever property it animates. */
const currentScale = (style: CSSStyleDeclaration) => {
  if (supportsScaleProperty()) return Number.parseFloat(style.scale);
  const matrix = /^matrix\(([^,]+),/.exec(style.transform);
  return matrix ? Number.parseFloat(matrix[1]!) : 1;
};
/** Settles when `animation` finishes or is cancelled; Chromium 69 has no `finished` promise. */
const animationDone = (animation: Animation): Promise<unknown> => {
  if (animation.finished) return animation.finished.catch(() => undefined);
  if (animation.playState === 'finished' || animation.playState === 'idle')
    return Promise.resolve();
  return new Promise(resolve => {
    animation.onfinish = resolve;
    animation.oncancel = resolve;
  });
};
const pulseKeyframes = (): Keyframe[] => [pulseFrame(1, 1), pulseFrame(1.1, 0.8), pulseFrame(1, 1)];
const PULSE_MS = 1400;
/** How long a stopped pulse takes to ease back to full size before the intro takes over. */
const PULSE_SETTLE_MS = 150;

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  const t = useT();
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
      void animationDone(settling).then(() => {
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
    const pulse = image.animate(pulseKeyframes(), {
      duration: PULSE_MS,
      easing: 'ease-in-out',
      iterations: Infinity,
    });
    return () => {
      // Read where the pulse is while it still runs, then ease from there to full size.
      const computed = getComputedStyle(image);
      const scale = currentScale(computed);
      const opacity = Number.parseFloat(computed.opacity);
      pulse.cancel();
      if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.001) return;
      settlingRef.current = image.animate(
        [pulseFrame(scale, Number.isFinite(opacity) ? opacity : 1), pulseFrame(1, 1)],
        { duration: PULSE_SETTLE_MS, easing: 'ease-out' }
      );
    };
  }, [isPulsing]);

  const isConfiguration = page === 'config' || page === 'config_wizard';
  const isIntro = page === 'intro';
  const position = isIntro
    ? 'intro'
    : isConfiguration
      ? 'configuration'
      : page === 'home'
        ? 'home'
        : 'page';

  return (
    <MotionConfig transition={{ duration: 0.4 }}>
      {isConfiguration && <div className={styles.configurationBackdrop} aria-hidden="true" />}
      <img
        ref={imageRef}
        className={styles.image}
        data-position={position}
        data-static={disableMotion || undefined}
        data-hidden={!visible || undefined}
        data-above-intro={aboveIntro || undefined}
        data-pulsing={isIntro && pulsing ? 'true' : undefined}
        src={logoSvgUrl}
        alt={t('common.logo')}
        onTransitionEnd={event => {
          if (event.propertyName === 'top') onPositionTransitionEnd?.();
        }}
      />
    </MotionConfig>
  );
};
