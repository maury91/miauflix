import { Logo as SVGLogo } from '../ui-elements/logo';
import { useAppSelector } from '../../store/store';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { Page } from '../../types';
import styled from 'styled-components';
import { useMediaBoxSizes } from '../pages/home/hooks/useMediaBoxSizes';

const profileSelectionLogo = {
  top: '5vh',
  left: 'calc(15vw - 9.1vh)',
  height: '5vh',
  width: '18.2vh',
};

const homeLogo = (margin: number) => ({
  top: '3vh',
  left: `${margin / 2 + window.innerWidth * 0.05}px`,
  height: '4vh',
  width: '14.5vh',
});

const playerLogo = {
  opacity: 0,
};

const LogoContainer = styled(motion.div)`
  position: fixed;
  z-index: 100;
`;

const getLogoStyle = (currentPage: Page, margin: number) => {
  switch (currentPage) {
    case 'profile-selection':
      return profileSelectionLogo;
    case 'home':
    case 'home/details':
    case 'home/categories':
      return homeLogo(margin);
    case 'player':
      return playerLogo;
  }
  return {};
};

export const Logo = () => {
  const { margin } = useMediaBoxSizes();
  const currentPage = useAppSelector(state => state.app.currentPage);
  return (
    <MotionConfig transition={{ duration: 0.4 }}>
      <AnimatePresence initial={false}>
        <LogoContainer key="logoLeft" animate={getLogoStyle(currentPage, margin)}>
          <SVGLogo />
        </LogoContainer>
      </AnimatePresence>
    </MotionConfig>
  );
};
