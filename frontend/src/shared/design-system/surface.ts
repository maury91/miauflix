import { createContext, useContext } from 'react';

/**
 * What an action sits on. Containers set it (Hero, player chrome and artwork-backed panels provide
 * `overMedia`); actions read it and expose it as `data-surface`, so their look is a static rule.
 */
export type SurfaceContextValue = 'solid' | 'overMedia';

const SurfaceContext = createContext<SurfaceContextValue>('solid');

export const SurfaceContextProvider = SurfaceContext.Provider;

export function useSurfaceContext(): SurfaceContextValue {
  return useContext(SurfaceContext);
}
