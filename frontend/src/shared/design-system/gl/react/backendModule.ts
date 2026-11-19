import { use } from 'react';

import { reportGlFailure } from './glSupport';

type BackendModule = typeof import('../pixi/backend');

let loaded: BackendModule | null = null;
let failed = false;
let loading: Promise<BackendModule | null> | null = null;

/**
 * Loads the Pixi backend, its own chunk: the web build never requests it. The TV build starts it
 * at startup, so it's in by the time a GlSurface renders. A chunk that fails to load resolves to
 * null and reports a GL failure (reportGlFailure): pages render their DOM form.
 */
export function preloadGlBackend(): Promise<BackendModule | null> {
  loading ??= import('../pixi/backend').then(
    module => (loaded = module),
    (error: unknown) => {
      console.error('[gl] backend unavailable', error);
      failed = true;
      reportGlFailure();
      return null;
    }
  );
  return loading;
}

/** The backend module, suspending while it loads; null if it couldn't load. */
export function useGlBackend(): BackendModule | null {
  if (loaded || failed) return loaded;
  return use(preloadGlBackend());
}

/**
 * Suspends while the backend chunk loads (when `enabled`). For a page whose own effects need the
 * surface's children mounted (Home's first focus looks for its rows): the page waits as a whole,
 * inside a Suspense boundary, instead of committing before its surface.
 */
export function useGlBackendReady(enabled: boolean) {
  if (enabled && !loaded && !failed) use(preloadGlBackend());
}
