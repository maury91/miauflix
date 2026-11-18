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
