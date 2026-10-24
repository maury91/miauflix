import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface WindowSize {
  width: number;
  height: number;
}

export interface MeasurementsState {
  window: WindowSize;
}

/** Server rendering and tests lay out for a common desktop size until the browser reports. */
export const initialMeasurementsState: MeasurementsState = {
  window: { width: 1920, height: 1080 },
};

export const measurementsSlice = createSlice({
  name: 'measurements',
  initialState: initialMeasurementsState,
  reducers: {
    windowSizeChanged(state, action: PayloadAction<WindowSize>) {
      if (
        state.window.width === action.payload.width &&
        state.window.height === action.payload.height
      )
        return;
      state.window = action.payload;
    },
  },
});

export const measurementActions = measurementsSlice.actions;

/** The current window size; stores without the measurements slice get the default size. */
export const selectWindowSize = (state: { measurements?: MeasurementsState }): WindowSize =>
  state.measurements?.window ?? initialMeasurementsState.window;
