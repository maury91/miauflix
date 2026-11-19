import { use } from 'react';

type BackendModule = typeof import('../pixi/backend');

let loaded: BackendModule | null = null;
let loading: Promise<BackendModule> | null = null;

/**
 * Loads the Pixi backend, its own chunk: the web build never requests it. The TV build starts it
 * at startup, so it's in by the time a GlSurface renders.
 */
export function preloadGlBackend(): Promise<BackendModule> {
  loading ??= import('../pixi/backend').then(module => (loaded = module));
  return loading;
}

/** The backend module once loaded, else null. */
export function loadedGlBackend(): BackendModule | null {
  return loaded;
}

/**
 * Suspends while the backend chunk loads (when `enabled`). For a page whose own effects need the
 * surface's children mounted (Home's first focus looks for its rows): the page waits as a whole,
 * inside a Suspense boundary, instead of committing before its surface.
 */
export function useGlBackendReady(enabled: boolean) {
  if (enabled && !loaded) use(preloadGlBackend());
}
