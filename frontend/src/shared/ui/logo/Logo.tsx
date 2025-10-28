import { MotionConfig } from 'framer-motion';
import styled from 'styled-components';

const logoSvgUrl = '/assets/images/logo.svg';

const LogoImage = styled.img`
  display: block;
  position: fixed;
  z-index: 1001;
  pointer-events: none;
  transition: all 0.4s ease-in-out;

  transform: translate(-50%, 0%);
  left: 50%;

  /* Desktop */
  top: calc(50% - 380px);
  height: 130px;

  /* Mobile */
  @media (max-width: 720px) {
    top: 50px;
    height: 70px;
  }
`;

export const Logo = () => {
  return (
    <MotionConfig transition={{ duration: 0.4 }}>
      <LogoImage src={logoSvgUrl} alt="Miauflix logo" />
    </MotionConfig>
  );
};
