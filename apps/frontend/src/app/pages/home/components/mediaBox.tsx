import styled from 'styled-components';
import { IS_TV } from '../../../../consts';

export const MEDIA_BOX_HEIGHT = 20;
export const MEDIA_BOX_WIDTH = MEDIA_BOX_HEIGHT * (16 / 9);

export const MediaBox = styled.div<{
  src: string;
  index: number;
  logoSrc?: string;
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
  top: 0;
  left: ${(props) => props.index * 37.2}vh;
  cursor: pointer;
`;

export const MediaHighlight = styled.div`
  position: absolute;
  top: -${MEDIA_BOX_HEIGHT * 0.015}vh;
  left: -${MEDIA_BOX_HEIGHT * 0.015}vh;
  width: ${MEDIA_BOX_WIDTH - MEDIA_BOX_HEIGHT * 0.015}vh;
  height: ${MEDIA_BOX_HEIGHT * 0.985}vh;
  border: ${MEDIA_BOX_HEIGHT * 0.03}vh solid #d81f27;
  border-radius: 1vh;
  z-index: 2;
  pointer-events: none;
`;
