import { useSyncExternalStore } from 'react';

let supported: boolean | undefined;
/** Whether this browser can create the surface's WebGL context. */
export function glSurfaceSupported() {
  if (supported === undefined) {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      supported = Boolean(gl);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      supported = false;
    }
  }
  return supported;
}

let failedAtRuntime = false;
const listeners = new Set<() => void>();

/**
 * A surface lost its context for good (ContextLossPolicy) or couldn't start: GL is off for the
 * rest of the session, and pages using `useGlAvailable` render their DOM form instead.
 */
export function reportGlFailure() {
  if (failedAtRuntime) return;
  failedAtRuntime = true;
  for (const listener of listeners) listener();
}

/** False once a surface failed (reportGlFailure): the page renders its DOM form. */
export function useGlAvailable() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => !failedAtRuntime,
    () => true
  );
}
