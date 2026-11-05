import { builtForTizen } from '@shared/config/constants';

interface PlushiesRuntime {
  THREE: typeof import('three');
  viewer: typeof import('plushies/viewer');
  plushies: typeof import('plushies');
}

let runtime: Promise<PlushiesRuntime> | null = null;

/** three.js and the Plushies viewer, loaded on first use so they stay out of the main bundle. */
export function loadPlushies(): Promise<PlushiesRuntime> {
  runtime ??= Promise.all([import('three'), import('plushies/viewer'), import('plushies')]).then(
    ([THREE, viewer, plushies]) => ({ THREE, viewer, plushies })
  );
  runtime.catch(() => {
    runtime = null;
  });
  return runtime;
}

let webgl: boolean | null = null;

function supportsWebGl(): boolean {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement('canvas');
    webgl = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    webgl = false;
  }
  return webgl;
}

/**
 * Whether avatars are drawn live (animated 3D) in Who's watching and the sidebar. TVs show the
 * pre-rendered pictures instead; the editor draws live everywhere, as it must.
 */
export function liveAvatarsSupported(): boolean {
  return typeof window !== 'undefined' && !builtForTizen && supportsWebGl();
}
