import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import styled from 'styled-components';

import { useAppSelector } from '../../store/store';
import type { Page } from '../../types';
import { useMediaBoxSizes } from '../pages/home/hooks/useMediaBoxSizes';
import { Logo as SVGLogo } from '../ui-elements/logo';

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

const loginLogo = {
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  height: '8vh',
  width: '29vh',
};

const LogoContainer = styled(motion.div)`
  position: fixed;
  z-index: 100;
`;

const getLogoStyle = (currentPage: Page, margin: number) => {
  switch (currentPage) {
    case 'profile-selection':
      return profileSelectionLogo;
    case 'home/details':
    case 'home/categories':
      return homeLogo(margin);
    case 'player':
      return playerLogo;
    case 'login':
    default:
      return loginLogo;
  }
};

export const Logo = () => {
  const { margin } = useMediaBoxSizes();
  const currentPage = useAppSelector(state => state.app.currentPage);
  const logoStyle = getLogoStyle(currentPage, margin);

  // Check if we're in SSR using the flag set in ssr-mocks.ts
  const isSSR = typeof window !== 'undefined' && window.__SSR__;

  return (
    <MotionConfig transition={{ duration: 0.4 }}>
      <AnimatePresence initial={false}>
        <LogoContainer
          key="logoLeft"
          animate={isSSR ? undefined : logoStyle}
          style={isSSR ? logoStyle : undefined}
        >
          <SVGLogo />
        </LogoContainer>
      </AnimatePresence>
    </MotionConfig>
  );
};
