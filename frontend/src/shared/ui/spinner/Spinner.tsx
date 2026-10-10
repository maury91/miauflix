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

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

export interface SpinnerProps {
  text?: string;
  size?: number;
}

export const Spinner: FC<SpinnerProps> = ({ text, size = 20 }) => {
  return (
    <SpinnerContainer role="status" aria-label={text ? undefined : 'Loading'}>
      <SpinnerIcon width={size} height={size} aria-hidden="true" />
      {text && <span>{text}</span>}
    </SpinnerContainer>
  );
};
