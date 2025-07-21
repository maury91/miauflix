import styled from 'styled-components';
import { IS_SLOW_DEVICE } from '@/consts';
import { MEDIA_BOX_HEIGHT } from './mediaBox';
import { SLIDER_MARGIN } from './categorySlider';

export const CATEGORY_CONTAINER_TOP_MASK = 8;

export const CategoriesContainer = styled.div<{
  visible: boolean;
}>`
  position: absolute;
  top: ${() => (IS_SLOW_DEVICE ? 50 : 45)}vh;
  left: 0;
  right: 0;
  bottom: 0;
  overflow-x: hidden;
  mask: ${() =>
    IS_SLOW_DEVICE
      ? ''
      : `linear-gradient(180deg, transparent 0%, black ${CATEGORY_CONTAINER_TOP_MASK}vh)`};
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transition: opacity 0.3s;

  &::-webkit-scrollbar {
    display: none;
  }
`;

export const CategoriesWrapper = styled.div<{ categoriesCount: number }>`
  height: ${({ categoriesCount }) =>
    (categoriesCount - 1) * (MEDIA_BOX_HEIGHT + SLIDER_MARGIN) + 60}vh;
`;
