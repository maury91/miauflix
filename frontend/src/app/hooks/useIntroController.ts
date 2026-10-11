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
    }
  }, [dispatch, homeEligible, introPhase]);

  useEffect(() => {
    if (
      introPhase !== 'centering' ||
      !homeEligible ||
      !homeHydrated ||
      !introAnimationReady ||
      !logoCentered
    ) {
      return undefined;
    }

    return scheduleWhenIdle(() => {
      if (homeEligibleRef.current && introPhaseRef.current === 'centering') {
        dispatch(beginIntroPlayback());
      }
    });
  }, [dispatch, homeEligible, homeHydrated, introAnimationReady, introPhase, logoCentered]);

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
    }
  }, []);

  const handleHomeHydrated = useCallback(() => {
    setHomeHydrated(true);
  }, []);

  useEffect(() => {
    if (appState !== 'loading') hasShownScreenRef.current = true;
  }, [appState]);

  return {
    introPhase,
    introHasStarted,
    hasShownScreen: hasShownScreenRef.current,
    logoRef,
    handleIntroComplete,
    handleIntroReady,
    handleLogoCentered,
    handleIntroStart,
    handleHomeHydrated,
  };
}
