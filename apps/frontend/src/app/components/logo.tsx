import { Logo as SVGLogo } from '../ui-elements/logo';
import { useAppSelector } from '../../store/store';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import styled from 'styled-components';
import { Page } from '../../types';

const profileSelectionLogo = {
  top: '5vh',
  left: '10vh',
  height: '5vh',
  width: '18.2vh',
};

const homeLogo = {
  top: '3vh',
  left: '3vh',
  height: '4vh',
  width: '14.5vh',
};

const getLogoStyle = (currentPage: Page) => {
  switch (currentPage) {
    case 'profile-selection':
      return profileSelectionLogo;
    case 'home':
      return homeLogo;
  }
};

export const Logo = () => {
  const currentPage = useAppSelector((state) => state.app.currentPage);
  return (
    <MotionConfig transition={{ duration: 0.4 }}>
      <AnimatePresence initial={false}>
        <motion.div
          key="logoLeft"
          style={{ position: 'fixed' }}
          animate={getLogoStyle(currentPage)}
        >
          <SVGLogo />
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
};
