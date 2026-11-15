import { createContext, useContext } from 'react';

const InListContext = createContext(false);

export const InListProvider = InListContext.Provider;

/** Rows are list items only inside a List. */
export function useListItemRole(): 'listitem' | undefined {
  return useContext(InListContext) ? 'listitem' : undefined;
}
