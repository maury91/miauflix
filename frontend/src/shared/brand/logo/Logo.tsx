import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useT } from '../../i18n';
import { brandLogoUrl } from './brandLogo';
import * as styles from './logo.css';

/**
 * Where the shared logo sits: centred (`intro`, loading and the intro), or in the corner of a
 * signed-in page. `none` hides it: sign-in, setup and the configuration wizard draw their own
 * static logo (StaticLogo).
 */
export type LogoPosition = 'intro' | 'home' | 'inner' | 'details' | 'none';

/** The pulse (logo.css.ts) animates `scale` where browsers have it, else `transform`. */
const supportsScaleProperty = () =>
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('scale', '1');
const pulseFrame = (scale: number, opacity: number): Keyframe =>
  supportsScaleProperty()
    ? { transformOrigin: '0 0', scale: String(scale), opacity }
    : { transformOrigin: '0 0', transform: `scale(${scale}) translate(-50%, -50%)`, opacity };
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
/** How long a stopped pulse takes to ease back to full size before the intro takes over. */
const PULSE_SETTLE_MS = 150;

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const Logo = ({
  position,
  homeLeft,
  disableMotion = false,
  visible = true,
  aboveIntro = false,
  pulsing = false,
  onPulseSettled,
  onPositionTransitionEnd,
}: {
  position: LogoPosition;
  /** Home's left edge (its cards' margin), in pixels. */
  homeLeft?: number;
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
  const isPulsing = position === 'intro' && pulsing;

  // The pulse is a CSS animation on `data-pulsing` (logo.css.ts), so the server-rendered logo
  // already pulses. The attribute follows `isPulsing` one step late: when the pulse stops, the
  // logo's scale is read while the animation still runs, and it eases from there to full size,
  // so the intro (drawn at scale 1) starts exactly on top of it.
  const [cssPulsing, setCssPulsing] = useState(isPulsing);
  const settlingRef = useRef<Animation | null>(null);
  useEffect(() => {
    const image = imageRef.current;
    if (isPulsing) {
      settlingRef.current?.cancel();
      settlingRef.current = null;
      setCssPulsing(true);
      return;
    }
    if (!image || image.dataset['pulsing'] === undefined) return;
    const computed = getComputedStyle(image);
    const scale = currentScale(computed);
    const opacity = Number.parseFloat(computed.opacity);
    if (
      typeof image.animate === 'function' &&
      Number.isFinite(scale) &&
      Math.abs(scale - 1) > 0.001
    )
      settlingRef.current = image.animate(
        [pulseFrame(scale, Number.isFinite(opacity) ? opacity : 1), pulseFrame(1, 1)],
        { duration: PULSE_SETTLE_MS, easing: 'ease-out' }
      );
    setCssPulsing(false);
  }, [isPulsing]);

  useEffect(() => {
    if (isPulsing || cssPulsing) return undefined;
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
  }, [isPulsing, cssPulsing]);

  // Set after hydration: the server lays out for a default window size
  useIsomorphicLayoutEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    if (homeLeft === undefined) image.style.removeProperty('--logo-home-left');
    else image.style.setProperty('--logo-home-left', `${homeLeft}px`);
  }, [homeLeft]);

  // Hidden, the logo waits where it was; shown again, it appears in place rather than moving there
  const hidden = position === 'none';
  const wasHiddenRef = useRef(hidden);
  const lastShownRef = useRef<Exclude<LogoPosition, 'none'>>(hidden ? 'intro' : position);
  if (!hidden) lastShownRef.current = position;
  const appearing = !hidden && wasHiddenRef.current;
  useEffect(() => {
    wasHiddenRef.current = hidden;
  }, [hidden]);

  return (
    <img
      ref={imageRef}
      className={styles.image}
      data-position={lastShownRef.current}
      data-static={disableMotion || hidden || appearing || undefined}
      data-hidden={!visible || hidden || undefined}
      data-above-intro={aboveIntro || undefined}
      data-pulsing={cssPulsing ? 'true' : undefined}
      src={brandLogoUrl}
      // Hidden, it leaves the name to the page's own logo
      alt={hidden ? '' : t('common.logo')}
      aria-hidden={hidden || undefined}
      onTransitionEnd={event => {
        if (event.propertyName === 'top') onPositionTransitionEnd?.();
      }}
    />
  );
};
