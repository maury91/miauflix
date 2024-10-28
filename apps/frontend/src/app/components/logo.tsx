import { Logo as SVGLogo } from '../ui-elements/logo';
import { useAppSelector } from '../../store/store';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { Page } from '../../types';
import styled from 'styled-components';

const profileSelectionLogo = {
  top: '5vh',
  left: '8vw',
  height: '5vh',
  width: '18.2vh',
};

const homeLogo = {
  top: '3vh',
  left: '3vh',
  height: '4vh',
  width: '14.5vh',
};

const playerLogo = {
  opacity: 0,
};

const LogoContainer = styled(motion.div)`
  position: fixed;
  z-index: 100;
`;

const getLogoStyle = (currentPage: Page) => {
  switch (currentPage) {
    case 'profile-selection':
      return profileSelectionLogo;
    case 'home':
      return homeLogo;
    case 'player':
      return playerLogo;
  }
  return {};
};

export const Logo = () => {
  const currentPage = useAppSelector((state) => state.app.currentPage);
  return (
    <MotionConfig transition={{ duration: 0.4 }}>
      <AnimatePresence initial={false}>
        <LogoContainer key="logoLeft" animate={getLogoStyle(currentPage)}>
          <SVGLogo />
        </LogoContainer>
      </AnimatePresence>
    </MotionConfig>
  );
};
