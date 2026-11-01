import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { clearAuth, setSession } from '@store/slices/auth';

/** How much a row wants its list: on screen, or ahead of navigation. */
export type RowIntent = 'visible' | 'prefetch';

interface HomeFeedState {
  /** The rows Home wants loaded, by list slug (see homeFeedMiddleware). */
  wanted: Record<string, RowIntent>;
}

const initialState: HomeFeedState = { wanted: {} };

const sameWanted = (left: Record<string, RowIntent>, right: Record<string, RowIntent>) => {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => left[key] === right[key]);
};

export const homeFeedSlice = createSlice({
  name: 'homeFeed',
  initialState,
  reducers: {
    /** Replace the rows Home wants; an equal set leaves the state as it is. */
    rowsWanted(state, action: PayloadAction<Record<string, RowIntent>>) {
      if (!sameWanted(state.wanted, action.payload)) state.wanted = action.payload;
    },
  },
  extraReducers: builder => {
    builder.addCase(clearAuth, () => initialState).addCase(setSession, () => initialState);
  },
});

export const homeFeedActions = homeFeedSlice.actions;
