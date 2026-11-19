import { createContext, useContext } from 'react';

/** Tiles under a GlFocusAnchor report their focus to it instead of drawing an outline. */
export interface FocusAnchor {
  set(id: string, focused: boolean): void;
}

export const FocusAnchorContext = createContext<FocusAnchor | null>(null);

export function useFocusAnchor() {
  return useContext(FocusAnchorContext);
}
