import type { AppState } from '@app/hooks/useAppState';
import { MotionConfig } from 'framer-motion';
import styled from 'styled-components';

const logoSvgUrl = '/assets/images/logo.svg';

/** Admin creation (`initial_setup`) uses a smaller mark */
const setupScale = 1;

const LogoImage = styled.img<{
  $setup: boolean;
  $configuration: boolean;
  $home: boolean;
  $intro: boolean;
  $disableMotion: boolean;
  $visible: boolean;
  $aboveIntro: boolean;
}>`
  display: block;
  position: fixed;
  z-index: ${({ $aboveIntro }) => ($aboveIntro ? 1003 : 1002)};
  pointer-events: none;
  visibility: ${({ $visible }) => ($visible ? 'visible' : 'hidden')};
  transition: ${({ $disableMotion }) => ($disableMotion ? 'none' : 'all 0.4s ease-in-out')};

  transform: ${({ $home, $intro }) =>
    $home ? 'none' : $intro ? 'translate(-50%, -50%)' : 'translate(-50%, 0%)'};
  left: ${({ $home }) => ($home ? '5vw' : '50%')};

  body[data-miauflix-details='true'] & {
    left: 8vw;
  }

  body[data-miauflix-player='true'] & {
    display: none;
  }

  /* Desktop */
  top: ${({ $home, $configuration, $intro }) =>
    $home ? '3vh' : $intro ? '50%' : $configuration ? '24px' : 'calc(50% - 380px)'};
  height: ${({ $setup, $configuration }) =>
    $configuration ? '56px' : $setup ? `${130 * setupScale}px` : '130px'};

  ${({ $intro }) => $intro && 'height: 130px;'}

  ${({ $home }) =>
    $home &&
    `
      width: 14.5vh;
      height: 4vh;
    `}

  /* Mobile */
  @media (max-width: 720px) {
    top: ${({ $home, $configuration, $intro }) =>
      $home ? '3vh' : $intro ? '50%' : $configuration ? '16px' : '50px'};
    height: ${({ $home, $setup, $configuration, $intro }) =>
      $home
        ? '4vh'
        : $intro
          ? '70px'
          : $configuration
            ? '48px'
            : $setup
              ? `${70 * setupScale}px`
              : '70px'};

    body[data-miauflix-details='true'] & {
      left: 30vw;
    }
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

export const Logo = ({
  page,
  disableMotion = false,
  visible = true,
  aboveIntro = false,
  onPositionTransitionEnd,
}: {
  page?: AppState | 'intro';
  disableMotion?: boolean;
  visible?: boolean;
  aboveIntro?: boolean;
  onPositionTransitionEnd?: () => void;
}) => {
  const isSetup = page === 'initial_setup';
  const isConfiguration = page === 'config' || page === 'config_wizard';
  const isHome = page === 'home';
  const isIntro = page === 'intro';

  return (
    <MotionConfig transition={{ duration: 0.4 }}>
      {isConfiguration && <ConfigurationHeaderBackdrop aria-hidden="true" />}
      <LogoImage
        $setup={isSetup}
        $configuration={isConfiguration}
        $home={isHome}
        $intro={isIntro}
        $disableMotion={disableMotion}
        $visible={visible}
        $aboveIntro={aboveIntro}
        src={logoSvgUrl}
        alt="Miauflix logo"
        onTransitionEnd={event => {
          if (event.propertyName === 'top') onPositionTransitionEnd?.();
        }}
      />
    </MotionConfig>
  );
};
