import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useAppSelector } from '../../store/store';
import { AnimatePresence, motion, MotionConfig, MotionConfigContext } from 'framer-motion';
import { usePrevious } from '../hooks/usePrevious';

type BackgroundDirections = 'top' | 'left' | 'full' | 'none';

export const BackgroundContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
`;

export const SimpleBackground = styled(BackgroundContainer)`
  background-color: #000;
`;

const BackgroundShadow = styled.div<{ direction: BackgroundDirections }>`
  position: fixed;
  opacity: ${({ direction }) => (direction === 'none' ? 0 : 1)};
  transition: opacity 1.5s;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: ${props => {
    if (props.direction === 'top') {
      return `linear-gradient( 180deg, rgb(0 0 0) 0%, rgba(0, 0, 0, 1) calc(20px + 5vh), rgba(0, 0, 0, 0.7) calc(20px + 13vh), rgba(0, 0, 0, 0.2) 40%, rgba(0, 0, 0, 0) 100%)`;
    }
    if (props.direction === 'left') {
      return `linear-gradient( 90deg,rgba(0,0,0,1) 0%,rgba(0,0,0,0.6) 30vw,rgba(0,0,0,0.5) 33vw,rgba(0,0,0,0.2) 40%,rgba(0,0,0,0) 100%)`;
    }
    if (props.direction === 'full') {
      return 'rgba(0,0,0,0.5)';
    }
    return 'rgba(0,0,0,0)';
  }};
`;

const BackgroundImage = styled(motion.div)<{
  url: string;
}>`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  right: 0;
  background: url(${props => props.url}) center;
  background-size: cover;
  transition: opacity 2s;
`;

const BackgroundLogo = styled(motion.div)<{
  url: string;
}>`
  position: absolute;
  width: 50vh;
  height: 20vh;
  bottom: 8vh;
  right: 8vh;
  background: url(${props => props.url}) no-repeat bottom right;
  background-size: contain;
  transition: opacity 2s;
`;

export const Background = () => {
  const shuffledBackgrounds = useAppSelector(state => state.app.shuffledBackgrounds);
  const backgrounds = useAppSelector(state => state.app.backgrounds);
  const logos = useAppSelector(state => state.app.logos);
  const currentPage = useAppSelector(state => state.app.currentPage);
  const previousPage = usePrevious(currentPage);
  const [currentBackground, setCurrentBackground] = useState(0);
  const transitionConfig = useMemo<MotionConfigContext['transition']>(() => {
    if (currentPage !== previousPage) {
      return {
        delay: 1,
        duration: 1,
      };
    }
    return {
      duration: 1.5,
    };
  }, [currentPage, previousPage]);

  const backgroundDirection = useMemo(() => {
    if (currentPage === 'profile-selection') {
      return 'full';
    }
    return 'none';
  }, [currentPage]);

  useEffect(() => {
    if (currentPage === 'profile-selection') {
      setCurrentBackground(0);
      const interval = setInterval(() => {
        setCurrentBackground(prev => (prev + 1) % backgrounds.length);
      }, 6e4 /* 1 minute */);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [backgrounds.length, currentPage]);

  useEffect(() => {
    if (currentPage === 'profile-selection') {
      const preloadImg = new Image();
      preloadImg.src = shuffledBackgrounds[(currentBackground + 1) % backgrounds.length];
      const preloadLogo = new Image();
      preloadLogo.src = logos[(currentBackground + 1) % backgrounds.length];
    }
  }, [backgrounds, shuffledBackgrounds, currentBackground, logos, currentPage]);

  if (!backgrounds.length) {
    return null;
  }

  return (
    <MotionConfig transition={transitionConfig}>
      <AnimatePresence>
        {currentPage === 'profile-selection' && (
          <BackgroundImage
            key={`background-${currentBackground}`}
            url={shuffledBackgrounds[currentBackground]}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
      <BackgroundShadow direction={backgroundDirection} />
      <AnimatePresence>
        {currentPage === 'profile-selection' && (
          <BackgroundLogo
            key={`logo-${currentBackground}`}
            url={logos[currentBackground]}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
};
