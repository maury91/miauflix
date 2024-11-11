import styled from 'styled-components';
import { IS_SLOW_DEVICE } from '../../../../consts';

export const CATEGORY_CONTAINER_TOP_MASK = 8;

export const CategoriesContainer = styled.div<{ visible: boolean }>`
  position: absolute;
  top: ${() => (IS_SLOW_DEVICE ? 50 : 45)}vh;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  mask: ${() =>
    IS_SLOW_DEVICE
      ? ''
      : `linear-gradient(180deg, transparent 0%, black ${CATEGORY_CONTAINER_TOP_MASK}vh)`};
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transition: opacity 0.3s;
`;
