import styled from 'styled-components';

// Consistent monospace text component for cross-platform rendering
// This ensures identical rendering across different environments including CI browsers
export const MonospaceText = styled.code`
  font-family: 'DejaVu Sans Mono';
  font-variant-ligatures: none;
  font-smooth: never;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: auto;
`;
