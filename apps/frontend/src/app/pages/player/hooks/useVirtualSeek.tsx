import { Player } from '../playerClassAbstract';
import { useCallback, useEffect, useState } from 'react';
import { useControls } from '../../../hooks/useControls';

function calculateStep(elapsed: number) {
  return (Math.pow(elapsed / 1000, 1.5) + 1) * 20000;
}

function calculatePosition(
  startingPosition: number,
  player: Player,
  action: 'FF' | 'REW' | null,
  actionStartingTime: number
) {
  if (action === 'FF') {
    return Math.min(
      startingPosition + calculateStep(Date.now() - actionStartingTime),
      player.videoLength() - 10000
    );
  }
  if (action === 'REW') {
    return Math.max(
      startingPosition - calculateStep(Date.now() - actionStartingTime),
      0
    );
  }
  return player.played();
}

// ToDo: Improve it, because it really sucks
export const useVirtualSeek = (player: Player) => {
  const [startingPosition, setStartingPosition] = useState(0);
  const [action, setAction] = useState<'FF' | 'REW' | null>(null);
  const [actionStartingTime, setActionStartingTime] = useState(Date.now());
  const [virtualPosition, setVirtualPosition] = useState(0);
  const [lastSeekTo, setLastSeekTo] = useState(0);
  const on = useControls('player');

  const onActionStart = useCallback(
    (type: 'FF' | 'REW') => {
      setAction(type);
      setActionStartingTime(Date.now());
      setStartingPosition(virtualPosition);
      setLastSeekTo(Date.now());
      player.pause();
    },
    [player, virtualPosition]
  );

  const onActionEnd = useCallback(() => {
    setAction(null);
    player.seekTo(
      calculatePosition(startingPosition, player, action, actionStartingTime)
    );
    player.play();
  }, [player, actionStartingTime, action, startingPosition]);

  useEffect(() => {
    const interval = setInterval(() => {
      setVirtualPosition(
        calculatePosition(startingPosition, player, action, actionStartingTime)
      );
    }, 30);
    return () => clearInterval(interval);
  }, [action, actionStartingTime, player, startingPosition]);

  // Seeking often has bad effect on the tv
  useEffect(() => {
    if (lastSeekTo < Date.now() - 2000) {
      if (action === 'FF' || action === 'REW') {
        player.seekTo(virtualPosition);
        setLastSeekTo(Date.now());
      }
    }
  }, [lastSeekTo, action, virtualPosition, player]);

  useEffect(
    () =>
      on(['left', 'right', 'left:released', 'right:released'], (control) => {
        switch (control) {
          case 'left':
            if (action !== 'REW') {
              onActionStart('REW');
            }
            break;
          case 'right':
            if (action !== 'FF') {
              onActionStart('FF');
            }
            break;
          case 'left:released':
          case 'right:released':
            onActionEnd();
            break;
        }
      }),
    [action, on, onActionEnd, onActionStart]
  );

  return virtualPosition;
};
