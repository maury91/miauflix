import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Logo } from './Logo';

const setup = (supportsScale: boolean) => {
  vi.stubGlobal('CSS', { supports: (property: string) => supportsScale && property === 'scale' });
  const animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  render(<Logo page="intro" pulsing />);
  return (animate.mock.calls[0] as unknown as [Keyframe[]])[0];
};

describe('Logo loading pulse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  it('animates the scale property where browsers support it', () => {
    expect(setup(true)[1]).toMatchObject({ scale: '1.1', opacity: 0.8 });
  });

  it("pulses the transform, keeping the logo centred, on the TV's older Chromium", () => {
    const keyframes = setup(false);
    expect(keyframes[1]).toMatchObject({
      transform: 'scale(1.1) translate(-50%, -50%)',
      transformOrigin: '0 0',
    });
    expect(keyframes[1]).not.toHaveProperty('scale');
  });

  it('reports the pulse settled on a browser without Animation.finished', async () => {
    vi.stubGlobal('CSS', { supports: () => false });
    const settle: Partial<Animation> = { playState: 'running', cancel: vi.fn() };
    const animate = vi.fn().mockReturnValueOnce({ cancel: vi.fn() }).mockReturnValueOnce(settle);
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      transform: 'matrix(1.05, 0, 0, 1.05, -50, -25)',
      opacity: '0.9',
    } as CSSStyleDeclaration);
    const onPulseSettled = vi.fn();
    const { rerender } = render(<Logo page="intro" pulsing onPulseSettled={onPulseSettled} />);
    rerender(<Logo page="intro" pulsing={false} onPulseSettled={onPulseSettled} />);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(onPulseSettled).not.toHaveBeenCalled();

    await act(async () => settle.onfinish?.call(settle as Animation, {} as AnimationPlaybackEvent));
    expect(onPulseSettled).toHaveBeenCalledTimes(1);
  });
});
