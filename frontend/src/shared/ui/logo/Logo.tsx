import type { AppState } from '@app/hooks/useAppState';
import { MotionConfig } from 'framer-motion';
import styled from 'styled-components';

const logoSvgUrl = '/assets/images/logo.svg';

/** Admin creation (`initial_setup`) uses a smaller mark */
const setupScale = 1;

const LogoImage = styled.img<{ $setup: boolean }>`
  display: block;
  position: fixed;
  z-index: 1001;
  pointer-events: none;
  transition: all 0.4s ease-in-out;

  transform: translate(-50%, 0%);
  left: 50%;

  /* Desktop */
  top: calc(50% - 380px);
  height: ${({ $setup }) => ($setup ? `${130 * setupScale}px` : '130px')};

  /* Mobile */
  @media (max-width: 720px) {
    top: 50px;
    height: ${({ $setup }) => ($setup ? `${70 * setupScale}px` : '70px')};
  }
`;

export const Logo = ({ page }: { page?: AppState }) => {
  const isSetup = page === 'initial_setup';

  return (
    <MotionConfig transition={{ duration: 0.4 }}>
      <LogoImage $setup={isSetup} src={logoSvgUrl} alt="Miauflix logo" />
    </MotionConfig>
  );
};
