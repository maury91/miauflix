import LineMdLoadingTwotoneLoop from '~icons/line-md/loading-twotone-loop';
import styled from 'styled-components';

export const LoadingIndicator = styled(LineMdLoadingTwotoneLoop)`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
`;
