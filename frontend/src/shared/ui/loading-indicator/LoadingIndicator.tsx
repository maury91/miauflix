import styled from 'styled-components';

/** Decorative spinner; put an accessible loading label on the surrounding status or button. */
export const LoadingIndicator = styled.span.attrs({ 'aria-hidden': true })`
  display: inline-block;
  flex: 0 0 auto;
  box-sizing: border-box;
  width: 1em;
  height: 1em;
  aspect-ratio: 1/1;
  border: 0.14em solid currentColor;
  border-left-color: transparent;
  border-radius: 50%;
  animation: loading-indicator-spin 1s linear infinite;

  @keyframes loading-indicator-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
