import { IntroAnimation, type LogoAnimationHandle } from '@app/shell/IntroAnimation';
import LoginPage from '@pages/login/LoginPage';
import { ErrorBoundary } from '@shared/components';
import { Logo } from '@shared/ui/logo/Logo';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

const INTRO_AUTO_START_DELAY = 0.1;

export function AppShell() {
  const [introComplete, setIntroComplete] = useState(false);
  const logoRef = useRef<LogoAnimationHandle>(null);

  const handleIntroComplete = useCallback(() => {
    setIntroComplete(true);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('miauflix:intro:animation:complete'));

      // Expose a flag for automated tests that wait for the intro animation to finish
      window._miauflixAnimationComplete = true;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !logoRef.current) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      logoRef.current?.start();
    }, INTRO_AUTO_START_DELAY * 1000);

    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <ErrorBoundary>
      <Logo />
      <MotionConfig transition={{ duration: 0.5 }}>
        <AnimatePresence initial={false} mode="wait">
          <LoginPage />
        </AnimatePresence>
      </MotionConfig>

      {!introComplete && (
        <IntroAnimation ref={logoRef} autoStart={false} onComplete={handleIntroComplete} />
      )}
    </ErrorBoundary>
  );
}

export default AppShell;
