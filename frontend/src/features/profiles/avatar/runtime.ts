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

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software/i;

/**
 * Whether WebGL is drawn by a GPU. Without one (software rendering, as in headless or GPU-less
 * browsers) the browser refuses a context that asks to fail on a major performance caveat: a few
 * animated Plushies would then take over the page.
 */
function supportsWebGl(): boolean {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement('canvas');
    const options: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
    const context: WebGLRenderingContext | WebGL2RenderingContext | null =
      canvas.getContext('webgl2', options) ?? canvas.getContext('webgl', options);
    // Some browsers (Chromium started with --disable-gpu) do not flag their software renderer.
    const info = context?.getExtension('WEBGL_debug_renderer_info');
    const renderer =
      context && info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    webgl = Boolean(context) && !SOFTWARE_RENDERER.test(renderer);
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

/**
 * Whether avatars are drawn live (animated 3D) in Who's watching and the sidebar, and missing
 * pictures drawn and uploaded. TVs and browsers without GPU-drawn WebGL show the pre-rendered
 * pictures instead; the editor draws live everywhere, as it must.
 */
export function liveAvatarsSupported(): boolean {
  return typeof window !== 'undefined' && !builtForTizen && supportsWebGl();
}
