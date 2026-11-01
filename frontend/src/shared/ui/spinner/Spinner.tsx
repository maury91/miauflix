import type { FC } from 'react';
import styled from 'styled-components';

import { builtForTizen } from '../../config/constants';
import { LoadingIndicator } from '../loading-indicator/LoadingIndicator';

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
      {builtForTizen ? (
        // Chromium 69 animates SVG (this icon's SMIL loop and its CSS spin) on the main thread,
        // a full frame on every display refresh, even out of view; it rotates an HTML element
        // on the compositor.
        <LoadingIndicator style={{ fontSize: `${size}px` }} />
      ) : (
        <SpinnerIcon width={size} height={size} aria-hidden="true" />
      )}
      {text && <span>{text}</span>}
    </SpinnerContainer>
  );
};
