import styled from 'styled-components';

export const MediaPreviewContainer = styled.div<{
  margin: number;
  expanded: boolean;
  visible: boolean;
}>`
  position: absolute;
  top: 0;
  height: ${({ expanded }) => (expanded ? 100 : 55)}vh;
  left: 0;
  right: 0;
  padding: 0 ${({ margin }) => margin}px 0 ${({ margin }) => margin + window.innerWidth * 0.05}px;
  overflow: hidden;
  overflow-y: scroll;
  visibility: ${({ visible }) => (visible ? 'visible' : 'hidden')};

  &::-webkit-scrollbar {
    display: none;
  }
`;
export const MediaPreviewShadow = styled.div`
  position: absolute;
  top: 0;
  height: 55vh;
  left: 50vw;
  width: 15vw;
  background: radial-gradient(ellipse at 100% 0%, rgba(0, 0, 0, 0) 50%, rgba(0, 0, 0, 1) 71%);
`;
export const MediaPreviewShadow2nd = styled.div`
  position: absolute;
  height: 15.5vh;
  top: 39.5vh;
  left: 65vw;
  right: 0;
  background: linear-gradient(
    181deg,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.5) 53%,
    rgba(0, 0, 0, 1) 100%
  );
`;
