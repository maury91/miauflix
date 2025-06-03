import styled from 'styled-components';
import { IS_TV, PALETTE } from '../../../../consts';

export const MEDIA_BOX_HEIGHT = 20;
export const MEDIA_BOX_WIDTH = MEDIA_BOX_HEIGHT * (16 / 9);

export const MediaBox = styled.div<{
  index: number;
  logoSrc?: string;
  progress?: number;
  src: string;
}>`
  border-radius: 0.7vh;
  background: ${({ logoSrc, src }) =>
    logoSrc
      ? `url(${logoSrc}) top left no-repeat, url(${src}) no-repeat`
      : `url(${src}) no-repeat`};
  background-size: ${({ logoSrc }) => (logoSrc ? '60%, 100%' : '100%')};
  background-position: ${({ logoSrc }) => (logoSrc ? '10% 10%, 0' : '')};
  height: ${IS_TV ? MEDIA_BOX_HEIGHT * 0.995 : MEDIA_BOX_HEIGHT}vh;
  width: ${MEDIA_BOX_WIDTH}vh;
  position: absolute;
  top: ${MEDIA_BOX_HEIGHT * 0.015}vh;
  left: ${props => props.index * 37.2 + MEDIA_BOX_HEIGHT * 0.015}vh;
  cursor: pointer;
  overflow: hidden;

  span {
    position: absolute;
    bottom: 1vh;
    left: 1vh;
    font-size: 2vh;
    padding: 0.2vh 0.6vh;
    color: ${PALETTE.text.primary};
    background: rgba(0, 0, 0, 0.5);
    font-weight: 600;
    z-index: 2;
  }

  ${({ progress }) =>
    progress &&
    `&:after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: ${progress}%;
    opacity: 0.7;
    height: 4%;
    background: ${PALETTE.background.primary};
  }`}
`;

export const MediaHighlight = styled.div`
  position: absolute;
  width: ${MEDIA_BOX_WIDTH - MEDIA_BOX_HEIGHT * 0.015}vh;
  height: ${MEDIA_BOX_HEIGHT * 0.985}vh;
  border: ${MEDIA_BOX_HEIGHT * 0.03}vh solid #d81f27;
  border-radius: 1vh;
  z-index: 2;
  pointer-events: none;
`;

export const OuterMediaHighlight = styled(MediaHighlight)`
  top: 0vh;
`;

export const OuterMediaHighlightBackground = styled.div`
  position: absolute;
  top: 6vh;
  height: ${MEDIA_BOX_HEIGHT * 1.05}vh;
  left: -${MEDIA_BOX_HEIGHT * 0.01}vh;
  width: ${MEDIA_BOX_HEIGHT * 0.03}vh;
  background: black;
`;
