import { measurementActions } from '@store/slices/measurements';

type Dispatch = (action: ReturnType<typeof measurementActions.windowSizeChanged>) => unknown;

/** Keep the store's window size current; the only resize listener layout needs. */
export function installBrowserMeasurements(dispatch: Dispatch): () => void {
  if (typeof window === 'undefined') return () => {};
  const update = () =>
    dispatch(
      measurementActions.windowSizeChanged({ width: window.innerWidth, height: window.innerHeight })
    );
  window.addEventListener('resize', update);
  update();
  return () => window.removeEventListener('resize', update);
}
