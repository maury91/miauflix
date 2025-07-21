import { ProfileSelection } from './pages/welcome';
import { useEffect, useMemo } from 'react';
import { useAppSelector } from '../store/store';
import { gsap } from 'gsap';
import { ExpoScaleEase } from 'gsap/EasePack';
import { introAnimation } from './animations/intro';
import {
  init,
  pause as pauseSpatialNavigation,
  resume as resumeSpatialNavigation,
} from '@noriginmedia/norigin-spatial-navigation';
import { Background, BackgroundContainer, SimpleBackground } from './components/background';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { Home } from './pages/home';
import { Logo } from './components/logo';
import { useGetListsQuery } from '../store/api/lists';
import { usePrefetch } from '../store/api/lists';
import { usePreloadHomeImages } from './pages/home/hooks/usePreloadHomeImages';
import { Player } from './pages/player';
import LoginPage from '../pages/LoginPage';

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

  useEffect(() => {
    if (firstCategory) {
      prefetchList({
        category: firstCategory.slug,
        page: 0,
      });
    }
  }, [firstCategory, prefetchList]);

  useEffect(() => {
    if (backgrounds.length) {
      const backgroundImg = new Image();
      backgroundImg.src = backgrounds[0];
      backgroundImg.onload = () =>
        introAnimation(() => {
          resumeSpatialNavigation();
          preloadHomeImages();
        });
    }
  }, [backgrounds, preloadHomeImages]);

  return (
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
  );
}

export default App;
