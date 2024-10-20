import styled from 'styled-components';
import { ProfileSelection } from './pages/welcome';
import { useEffect } from 'react';
// import { animate } from 'framer-motion/dom';
import { useGetTrendingMoviesQuery } from '../store/api/movies';
import { useAppSelector } from '../store/store';
import { gsap } from 'gsap';
import { ExpoScaleEase } from 'gsap/EasePack';
import { introAnimation } from './animations/intro';
import {
  init,
  pause as pauseSpatialNavigation,
  resume as resumeSpatialNavigation,
} from '@noriginmedia/norigin-spatial-navigation';
import { Background } from './components/background';
import { StyledLogo } from './pages/welcome/components/various';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';

init({
  debug: true,
  visualDebug: true,
});

pauseSpatialNavigation();

gsap.registerPlugin(ExpoScaleEase);

export function App() {
  useGetTrendingMoviesQuery();
  const backgrounds = useAppSelector((state) => state.app.backgrounds);
  const currentPage = useAppSelector((state) => state.app.currentPage);

  useEffect(() => {
    if (backgrounds.length) {
      const backgroundImg = new Image();
      backgroundImg.src = backgrounds[0];
      backgroundImg.onload = () => introAnimation(resumeSpatialNavigation);
    }
  }, [backgrounds]);

  return (
    <>
      <Background />
      <StyledLogo />
      <AnimatePresence initial={false}>
        {currentPage === 'profile-selection' && (
          <MotionConfig transition={{ duration: 1 }}>
            <motion.div
              key="profile-selection"
              style={{ position: 'absolute', top: 0, left: 0, bottom: 0 }}
              initial={{ x: '-120%' }}
              animate={{ x: '0' }}
              exit={{ x: '-120%' }}
            >
              <ProfileSelection />
            </motion.div>
          </MotionConfig>
        )}
      </AnimatePresence>
    </>
  );
}

export default App;
