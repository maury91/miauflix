import {
  init,
  pause as pauseSpatialNavigation,
  resume as resumeSpatialNavigation,
} from '@noriginmedia/norigin-spatial-navigation';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { gsap } from 'gsap';
import { ExpoScaleEase } from 'gsap/EasePack';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { IS_TIZEN } from '@/consts';
import { useAppInitialization } from '@/hooks/useAppInitialization';

import LoginPage from '../pages/LoginPage';
import { useGetListsQuery } from '../store/api/lists';
import { usePrefetch } from '../store/api/lists';
import { useAppSelector } from '../store/store';
import { IntroAnimation, type LogoAnimationHandle } from './animations/intro';
import { Background, BackgroundContainer, SimpleBackground } from './components/background';
import { Logo } from './components/logo';
import { Home } from './pages/home';
import { usePreloadHomeImages } from './pages/home/hooks/usePreloadHomeImages';
import { Player } from './pages/player';
import { ProfileSelection } from './pages/welcome';

init({
  // debug: true,
  // visualDebug: true,
});

pauseSpatialNavigation();

gsap.registerPlugin(ExpoScaleEase);

export function App() {
  // Initialize the app with health check and authentication
  const { isInitialized, isLoading } = useAppInitialization();

  // Only fetch lists after initialization is complete and we're authenticated
  const currentPage = useAppSelector(state => state.app.currentPage);
  const isAuthenticated = useAppSelector(state => state.app.auth.isAuthenticated);

  const { data: categories } = useGetListsQuery(undefined, {
    skip: !isInitialized || !isAuthenticated || currentPage === 'login',
  });

  const firstCategory = useMemo(() => categories?.[0], [categories]);
  // FixMe: Problem of the backgrounds is that they are behind an authenticated endpoint,
  // we need an endpoint that returns the backgrounds without authentication
  const prefetchList = usePrefetch('getList');
  const backgrounds = useAppSelector(state => state.app.backgrounds);
  const preloadHomeImages = usePreloadHomeImages();
  const logoRef = useRef<LogoAnimationHandle>(null);

  const onAnimationComplete = useCallback(() => {
    resumeSpatialNavigation();
    preloadHomeImages();
  }, [preloadHomeImages]);

  useEffect(() => {
    if (firstCategory) {
      prefetchList({
        category: firstCategory.slug,
        page: 0,
      });
    }
  }, [firstCategory, prefetchList]);

  // Start animation after app initialization is complete
  useEffect(() => {
    if (isInitialized && !isLoading && logoRef.current) {
      // FixMe: Skip the backgrounds for now,
      // we will put them back once we have an endpoint that returns the backgrounds without authentication
      // if (backgrounds.length) {
      //   const backgroundImg = new Image();

      //   const handleLoad = () => {
      //     logoRef.current?.start();
      //   };

      //   const handleError = (error: Event | string) => {
      //     console.warn('Background image failed to load:', error);
      //     // Start logo animation anyway to prevent UI from getting stuck
      //     logoRef.current?.start();
      //   };

      //   // Set up event listeners
      //   backgroundImg.onload = handleLoad;
      //   backgroundImg.onerror = handleError;

      //   // Set the source to trigger loading
      //   backgroundImg.src = backgrounds[0];

      //   // Handle case where image is already cached/complete
      //   if (backgroundImg.complete) {
      //     if (backgroundImg.naturalWidth > 0) {
      //       // Image loaded successfully
      //       handleLoad();
      //     } else {
      //       // Image failed to load
      //       handleError('Image failed to load (cached)');
      //     }
      //   }

      //   // Cleanup function to prevent memory leaks
      //   return () => {
      //     backgroundImg.onload = null;
      //     backgroundImg.onerror = null;
      //   };
      // } else {
      //   // No backgrounds, start animation immediately
      //   logoRef.current.start();
      // }
      logoRef.current.start();
    }
    return () => {};
  }, [isInitialized, isLoading, backgrounds]);

  return (
    <>
      <MotionConfig transition={{ duration: 1 }}>
        {/* Loading state overlay */}
        {/* {(isLoading || !isInitialized) && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              gap: '20px',
              zIndex: 1001,
              backgroundColor: 'transparent',
            }}
          >
            {error && (
              <div style={{ color: '#ff6b6b', textAlign: 'center' }}>
                <div>Error: {error}</div>
                {!serverAvailable && (
                  <div style={{ fontSize: '0.9rem', marginTop: '10px' }}>
                    Please check if the server is running and accessible.
                  </div>
                )}
              </div>
            )}
          </div>
        )} */}

        {/* Main application content */}
        <AnimatePresence initial={false}>
          {currentPage === 'profile-selection' && (
            <BackgroundContainer
              key="background"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Background />
            </BackgroundContainer>
          )}
          {currentPage.startsWith('home') && (
            <SimpleBackground
              key="simple-background"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>
        <Logo />
        <MotionConfig transition={{ duration: 0.5 }}>
          <AnimatePresence initial={false} mode="wait">
            {currentPage === 'login' && <LoginPage key="login" />}
            {currentPage === 'profile-selection' && <ProfileSelection key="profile-selection" />}
            {(currentPage.startsWith('home') || currentPage === 'player') && <Home key="home" />}
            {currentPage === 'player' && <Player key="player" />}
            {/* FixMe: We need an error page */}
          </AnimatePresence>
        </MotionConfig>
      </MotionConfig>

      <IntroAnimation
        ref={logoRef}
        onComplete={onAnimationComplete}
        lowResourceAnimation={IS_TIZEN}
      />
    </>
  );
}

export default App;
