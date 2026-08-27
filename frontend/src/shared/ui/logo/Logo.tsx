import type { AppState } from '@app/hooks/useAppState';
import { MotionConfig } from 'framer-motion';
import styled from 'styled-components';

const logoSvgUrl = '/assets/images/logo.svg';

/** Admin creation (`initial_setup`) uses a smaller mark */
const setupScale = 1;

const LogoImage = styled.img<{ $setup: boolean; $configuration: boolean }>`
  display: block;
  position: fixed;
  z-index: 1002;
  pointer-events: none;
  transition: all 0.4s ease-in-out;

  transform: translate(-50%, 0%);
  left: 50%;

  /* Desktop */
  top: ${({ $configuration }) => ($configuration ? '24px' : 'calc(50% - 380px)')};
  height: ${({ $setup, $configuration }) =>
    $configuration ? '56px' : $setup ? `${130 * setupScale}px` : '130px'};

  /* Mobile */
  @media (max-width: 720px) {
    top: ${({ $configuration }) => ($configuration ? '16px' : '50px')};
    height: ${({ $setup, $configuration }) =>
      $configuration ? '48px' : $setup ? `${70 * setupScale}px` : '70px'};
  }
`;

const ConfigurationHeaderBackdrop = styled.div`
  position: fixed;
  inset: 0 0 auto;
  height: 104px;
  background-color: #0a0d0f;
  z-index: 1001;

  @media (max-width: 720px) {
    height: 80px;
  }
`;

export const Logo = ({ page }: { page?: AppState }) => {
  const isSetup = page === 'initial_setup';
  const isConfiguration = page === 'config';

  return (
    <MotionConfig transition={{ duration: 0.4 }}>
      {isConfiguration && <ConfigurationHeaderBackdrop aria-hidden="true" />}
      <LogoImage
        $setup={isSetup}
        $configuration={isConfiguration}
        src={logoSvgUrl}
        alt="Miauflix logo"
      />
    </MotionConfig>
  );
};
