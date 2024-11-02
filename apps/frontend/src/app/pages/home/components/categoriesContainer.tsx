import styled from 'styled-components';
import { IS_SLOW_DEVICE } from '../../../../consts';

export const CategoriesContainer = styled.div<{ visible: boolean }>`
  position: absolute;
  top: ${() => (IS_SLOW_DEVICE ? 50 : 45)}vh;
  left: 5vw;
  right: 0;
  bottom: 0;
  overflow: hidden;
  mask: ${() =>
    IS_SLOW_DEVICE ? '' : 'linear-gradient(180deg, transparent 0%, black 8vh)'};
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transition: opacity 0.3s;
`;
