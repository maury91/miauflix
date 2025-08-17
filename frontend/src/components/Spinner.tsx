import type { FC } from 'react';
import styled from 'styled-components';

import LineMdLoadingTwotoneLoop from '~icons/line-md/loading-twotone-loop';

const SpinnerContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #cccccc;
  font-size: 14px;
`;

const SpinnerIcon = styled(LineMdLoadingTwotoneLoop)`
  animation: spin 1s linear infinite;

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

interface SpinnerProps {
  text?: string;
  size?: number;
}

export const Spinner: FC<SpinnerProps> = ({ text, size = 20 }) => {
  return (
    <SpinnerContainer>
      <SpinnerIcon width={size} height={size} />
      {text && <span>{text}</span>}
    </SpinnerContainer>
  );
};
