import { createContext, useContext } from 'react';

import type { Player } from './playerClassAbstract';

interface PlayerContext {
  player: Player | null;
}

export const playerContext = createContext<Player | null>(null);

export const PlayerProvider = playerContext.Provider;

export const usePlayerContext = () => {
  const player = useContext(playerContext);

  if (!player) {
    throw new Error('usePlayerContext should be used with a PlayerProvider');
  }

  return player;
};
