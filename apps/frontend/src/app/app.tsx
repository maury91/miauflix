import { ProfileSelection, ProfileSelectionContainer } from './pages/welcome';
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
import {
  Background,
  BackgroundContainer,
  SimpleBackground,
} from './components/background';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { Home, HomeContainer } from './pages/home';
import { Logo } from './components/logo';
import { useGetCategoriesQuery } from '../store/api/categories';
import { usePrefetch } from '../store/api/lists';
import { usePreloadHomeImages } from './pages/home/hooks/usePreloadHomeImages';
import { Player } from './pages/player';

init({
  // debug: true,
  // visualDebug: true,
});

pauseSpatialNavigation();

gsap.registerPlugin(ExpoScaleEase);

export function App() {
  const { data: categories } = useGetCategoriesQuery();
  const firstCategory = useMemo(() => categories?.[0], [categories]);
  const prefetchList = usePrefetch('getList');
  const backgrounds = useAppSelector((state) => state.app.backgrounds);
  const currentPage = useAppSelector((state) => state.app.currentPage);
  const preloadHomeImages = usePreloadHomeImages();

  useEffect(() => {
    if (firstCategory) {
      prefetchList({
        category: firstCategory.id,
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
        {currentPage === 'home' && (
          <SimpleBackground
            key="simple-background"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
      <Logo />
      <AnimatePresence initial={false}>
        {currentPage === 'profile-selection' && (
          <ProfileSelectionContainer
            key="profile-selection"
            initial={{ x: '-120%' }}
            animate={{ x: '0' }}
            exit={{ x: '-120%' }}
          >
            <ProfileSelection />
          </ProfileSelectionContainer>
        )}
        {(currentPage === 'home' || currentPage === 'player') && (
          <HomeContainer
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: currentPage === 'player' ? 0 : 1 }}
            exit={{ opacity: 0 }}
          >
            <Home />
          </HomeContainer>
        )}
        {currentPage === 'player' && <Player />}
      </AnimatePresence>
    </MotionConfig>
  );
}

export default App;
