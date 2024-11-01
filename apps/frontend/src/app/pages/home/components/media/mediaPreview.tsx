import styled from 'styled-components';

export const MediaPreviewContainer = styled.div<{ margin: number }>`
  position: absolute;
  top: 0;
  height: 65vh;
  left: 0;
  right: 0;
  padding: 0 ${({ margin }) => margin}px 0
    ${({ margin }) => margin + window.innerWidth * 0.05}px;
`;
export const MediaPreviewShadow = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50vw;
  width: 15vw;
  background: radial-gradient(
    ellipse at 100% 0%,
    rgba(0, 0, 0, 0) 40%,
    rgba(0, 0, 0, 1) 74%
  );
  // IS_SLOW_DEVICE
  //   ? 'radial-gradient(ellipse at 100% 0%, rgba(0,0,0,0) 60%,rgba(0,0,0,1) 70%);'
  //   : \`radial-gradient(farthest-corner at 100% -20%,rgba(0,0,0,0) 65%,rgba(0,0,0,1) 82%),
  //   linear-gradient(
  //     0deg,
  //     rgba(0, 0, 0, 1) 15%,
  //     rgba(0, 0, 0, 0) 25%
  //   ),
  //   linear-gradient( 90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 20%)\`
`;
export const MediaPreviewShadow2nd = styled.div`
  position: absolute;
  height: 27.5vh;
  bottom: 0;
  left: 65vw;
  right: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 1) 100%
  );
`;
