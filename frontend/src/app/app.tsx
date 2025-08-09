import {
  init,
  pause as pauseSpatialNavigation,
  resume as resumeSpatialNavigation,
} from '@noriginmedia/norigin-spatial-navigation';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { gsap } from 'gsap';
import { ExpoScaleEase } from 'gsap/EasePack';
import { useEffect, useMemo, useRef } from 'react';

import { IS_TIZEN } from '@/consts';

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
  const { data: categories } = useGetListsQuery();
  const firstCategory = useMemo(() => categories?.[0], [categories]);
  const prefetchList = usePrefetch('getList');
  const backgrounds = useAppSelector(state => state.app.backgrounds);
  const currentPage = useAppSelector(state => state.app.currentPage);
  const preloadHomeImages = usePreloadHomeImages();
  const logoRef = useRef<LogoAnimationHandle>(null);

  useEffect(() => {
    if (firstCategory) {
      prefetchList({
        category: firstCategory.slug,
        page: 0,
      });
    }
  }, [firstCategory, prefetchList]);

  useEffect(() => {
    if (backgrounds.length && logoRef.current) {
      const backgroundImg = new Image();
      backgroundImg.src = backgrounds[0];
      backgroundImg.onload = () => {
        logoRef.current?.start();
      };
    }
  }, [backgrounds, preloadHomeImages]);

  return (
    <>
      <MotionConfig transition={{ duration: 1 }}>
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
          </AnimatePresence>
        </MotionConfig>
      </MotionConfig>
      <IntroAnimation
        ref={logoRef}
        duration={2.5}
        delay={1}
        onComplete={() => {
          resumeSpatialNavigation();
          preloadHomeImages();
        }}
        lowResourceAnimation={IS_TIZEN}
      />
    </>
  );
}

export default App;
