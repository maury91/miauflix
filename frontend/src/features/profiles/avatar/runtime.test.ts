import { afterEach, describe, expect, it, vi } from 'vitest';

const constants = vi.hoisted(() => ({ builtForTizen: false }));
vi.mock('@shared/config/constants', () => constants);

const RENDERER = 0x9246;

/** A WebGL context drawn by `renderer`, or none when the browser refuses a slow one. */
function stubWebGl(renderer: string | null) {
  const getContext = vi.fn((_kind: string, options?: WebGLContextAttributes) => {
    if (renderer === null && options?.failIfMajorPerformanceCaveat) return null;
    return {
      getExtension: (name: string) =>
        name === 'WEBGL_debug_renderer_info'
          ? { UNMASKED_RENDERER_WEBGL: RENDERER }
          : { loseContext: vi.fn() },
      getParameter: (parameter: number) => (parameter === RENDERER ? renderer : null),
    };
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(getContext as never);
  return getContext;
}

/** The capability is measured once per app run: load the module afresh for each case. */
const liveAvatarsSupported = async (options?: { onTv?: boolean }) => {
  vi.resetModules();
  return (await import('./runtime')).liveAvatarsSupported(options);
};

const GPU = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified)';

afterEach(() => {
  vi.restoreAllMocks();
  constants.builtForTizen = false;
});

describe('liveAvatarsSupported', () => {
  it('draws live where a GPU draws WebGL', async () => {
    const getContext = stubWebGl('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified)');
    await expect(liveAvatarsSupported()).resolves.toBe(true);
    expect(getContext).toHaveBeenCalledWith('webgl2', { failIfMajorPerformanceCaveat: true });
  });

  it('shows pictures where the browser refuses a slow WebGL', async () => {
    stubWebGl(null);
    await expect(liveAvatarsSupported()).resolves.toBe(false);
  });

  it('shows pictures where WebGL is drawn in software', async () => {
    stubWebGl(
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)'
    );
    await expect(liveAvatarsSupported()).resolves.toBe(false);
  });

  it('shows pictures on the TV unless the page asks for live drawing there', async () => {
    constants.builtForTizen = true;
    stubWebGl(GPU);
    await expect(liveAvatarsSupported()).resolves.toBe(false);
    await expect(liveAvatarsSupported({ onTv: true })).resolves.toBe(true);
  });

  it('shows pictures on a TV without GPU-drawn WebGL, even when asked to draw live', async () => {
    constants.builtForTizen = true;
    stubWebGl(null);
    await expect(liveAvatarsSupported({ onTv: true })).resolves.toBe(false);
  });
});
