import styled from 'styled-components';
import OcticonPlay16 from '~icons/octicon/play-16';
import MdiPaw from '~icons/mdi/paw';
import LineMdPlayFilled from '~icons/line-md/play-filled';
import { PALETTE } from '../../../../consts';

export const PauseOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
`;

export const PauseIcon = styled(OcticonPlay16)`
  font-size: 10vh;
  color: #aaa;
`;

export const PlayerProgressBarContainer = styled.div`
  position: absolute;
  left: 8vw;
  right: 8vw;
  background: #aaa;
  height: 0.5vh;
  bottom: 8vh;
`;

export const OverlayPlayIcon = styled(LineMdPlayFilled)`
  position: absolute;
  left: 3vw;
  bottom: 4vh;
  font-size: 4vh;
  color: #aaa;
  transform: translate(0, -50%);
`;

export const PlayerProgressBar = styled.div<{ percent: number }>`
  position: absolute;
  left: 0;
  top: 0;
  width: ${({ percent }) => percent}%;
  height: 100%;
  background: ${PALETTE.background.primary};
`;

export const PlayerProgressBubble = styled(MdiPaw)<{ percent: number }>`
  position: absolute;
  left: ${({ percent }) => percent}%;
  top: 50%;
  font-size: 3.5vh;
  color: ${PALETTE.background.primary};
  transform: translate(-50%, -63%);
`;

export const PlayedTimeContainer = styled.div`
  position: absolute;
  left: 8vw;
  bottom: 2vh;
  font-size: 2.5vh;
  color: ${PALETTE.text.primary};
  font-family: 'Poppins', sans-serif;
  font-weight: 400;
`;

export const PlayedTime = styled.span`
  color: ${PALETTE.background.primary};
  margin-right: 0.5em;
`;

export const TotalTime = styled.span`
  color: ${PALETTE.background.disabled};
  margin-left: 0.5em;
`;
