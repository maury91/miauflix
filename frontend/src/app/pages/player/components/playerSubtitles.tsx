import type { FC } from 'react';
import { useEffect, useState } from 'react';
import styled from 'styled-components';

import { usePlayerContext } from '../context';

const SubtitleDisplay = styled.p<{ index: number }>`
  position: fixed;
  text-align: center;
  font-size: 3vh;
  color: white;
  background: rgba(0, 0, 0, 0.3);
  bottom: ${({ index }) => 10 - index * 4}vh;
  z-index: 10002;
  left: 50%;
  transform: translateX(-50%);
`;

export const PlayerSubtitles: FC = () => {
  const player = usePlayerContext();
  const [subtitle, setSubtitle] = useState('');

  useEffect(() => {
    player.on('subtitle', text => {
      setSubtitle(text);
    });
  }, [player]);

  if (subtitle.length === 0) {
    return [];
  }

  return subtitle.split('<br>').map((line, index, arr) => (
    <SubtitleDisplay key={index} index={index - Math.max(arr.length - 2, 0)}>
      {line}
    </SubtitleDisplay>
  ));
};
