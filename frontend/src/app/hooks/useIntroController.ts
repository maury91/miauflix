import type { AppState } from '@app/hooks/useAppState';
import type { LogoAnimationHandle } from '@app/shell/IntroAnimation';
import { useAppDispatch, useAppSelector } from '@store';
import {
  beginIntroPlayback,
  completeIntro,
  selectIntroPhase,
  setIntroEligible,
} from '@store/slices/appState';
import { useCallback, useEffect, useRef, useState } from 'react';

function scheduleWhenIdle(callback: () => void): () => void {
  if (window.requestIdleCallback) {
    const handle = window.requestIdleCallback(callback);
    return () => window.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, 50);
  return () => window.clearTimeout(handle);
}

/** Coordinates mounted Home and logo readiness with the intro's Redux phase. */
export function useIntroController(appState: AppState, homeEligible: boolean) {
  const dispatch = useAppDispatch();
  const introPhase = useAppSelector(selectIntroPhase);
  const [homeHydrated, setHomeHydrated] = useState(false);
  const [introAnimationReady, setIntroAnimationReady] = useState(false);
  const [logoCentered, setLogoCentered] = useState(false);
  const [introHasStarted, setIntroHasStarted] = useState(false);
  const [booted, setBooted] = useState(false);
  const [logoSettled, setLogoSettled] = useState(false);
  const logoRef = useRef<LogoAnimationHandle>(null);
  const hasShownScreenRef = useRef(false);
  const introPhaseRef = useRef(introPhase);
  const homeEligibleRef = useRef(homeEligible);
  introPhaseRef.current = introPhase;
  homeEligibleRef.current = homeEligible;

  const handleIntroComplete = useCallback(() => {
    if (!homeEligibleRef.current || introPhaseRef.current !== 'playing') return;
    introPhaseRef.current = 'complete';
    dispatch(completeIntro());

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('miauflix:intro:animation:complete'));

      // Expose a flag for automated tests that wait for the intro animation to finish
      window._miauflixAnimationComplete = true;
    }
  }, [dispatch]);

  useEffect(() => {
    if (homeEligible && introPhase === 'pending') {
      setLogoCentered(!hasShownScreenRef.current);
    }
    dispatch(setIntroEligible(homeEligible));
    if (!homeEligible) {
      setHomeHydrated(false);
      setIntroAnimationReady(false);
      setLogoCentered(false);
      setIntroHasStarted(false);
      setLogoSettled(false);
    }
  }, [dispatch, homeEligible, introPhase]);

  // Everything the intro needs is ready; the loading pulse stops and settles before it plays.
  const introReady =
    introPhase === 'centering' &&
    homeEligible &&
    homeHydrated &&
    introAnimationReady &&
    logoCentered;
  const introReadyRef = useRef(introReady);
  introReadyRef.current = introReady;

  useEffect(() => {
    if (!introReady || !logoSettled) return undefined;

    return scheduleWhenIdle(() => {
      if (homeEligibleRef.current && introPhaseRef.current === 'centering') {
        dispatch(beginIntroPlayback());
      }
    });
  }, [dispatch, introReady, logoSettled]);

  /** The centred logo is back at full size, so the intro can start on top of it. */
  const handleLogoSettled = useCallback(() => {
    if (introReadyRef.current) setLogoSettled(true);
  }, []);

  const handleIntroReady = useCallback(() => {
    if (homeEligibleRef.current && introPhaseRef.current !== 'complete') {
      setIntroAnimationReady(true);
    }
  }, []);

  const handleLogoCentered = useCallback(() => {
    if (homeEligibleRef.current && introPhaseRef.current === 'centering') {
      setLogoCentered(true);
    }
  }, []);

  useEffect(() => {
    if (homeEligible && introPhase === 'playing' && homeHydrated && introAnimationReady) {
      logoRef.current?.start();
    }
  }, [homeEligible, homeHydrated, introAnimationReady, introPhase]);

  const handleIntroStart = useCallback(() => {
    if (homeEligibleRef.current && introPhaseRef.current === 'playing') {
      setIntroHasStarted(true);
      window.dispatchEvent(new Event('miauflix:intro:animation:start'));
    }
  }, []);

  const handleHomeHydrated = useCallback(() => {
    setHomeHydrated(true);
  }, []);

  useEffect(() => {
    if (appState !== 'loading') hasShownScreenRef.current = true;
  }, [appState]);

  // The app always opens on the centred logo. Once it has been painted there and the app knows
  // where to go, `booted` lets it move to that page's position (even if the requests were
  // already done by the first render).
  useEffect(() => {
    if (booted || appState === 'loading') return undefined;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setBooted(true));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [appState, booted]);

  return {
    introPhase,
    introHasStarted,
    introReady,
    booted,
    hasShownScreen: hasShownScreenRef.current,
    logoRef,
    handleIntroComplete,
    handleIntroReady,
    handleLogoCentered,
    handleLogoSettled,
    handleIntroStart,
    handleHomeHydrated,
  };
}
