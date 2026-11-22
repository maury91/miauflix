import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Logo } from './Logo';

const logo = () => document.querySelector('img')!;

describe('Logo loading pulse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  it('pulses in CSS from the first render, so the server-rendered logo already pulses', () => {
    render(<Logo position="intro" pulsing />);
    expect(logo()).toHaveAttribute('data-pulsing', 'true');
    expect(logo()).toHaveAttribute('data-position', 'intro');
  });

  it('eases from the running pulse back to full size on the scale property', () => {
    vi.stubGlobal('CSS', { supports: (property: string) => property === 'scale' });
    const animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      scale: '1.05',
      opacity: '0.9',
    } as CSSStyleDeclaration);
    const { rerender } = render(<Logo position="intro" pulsing />);
    rerender(<Logo position="intro" pulsing={false} />);

    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes] = animate.mock.calls[0] as unknown as [Keyframe[]];
    expect(keyframes[0]).toMatchObject({ scale: '1.05', opacity: 0.9 });
    expect(keyframes[1]).toMatchObject({ scale: '1', opacity: 1 });
    expect(logo()).not.toHaveAttribute('data-pulsing');
  });

  it("settles the transform, keeping the logo centred, on the TV's older Chromium", async () => {
    vi.stubGlobal('CSS', { supports: () => false });
    const settle: Partial<Animation> = { playState: 'running', cancel: vi.fn() };
    const animate = vi.fn().mockReturnValueOnce(settle);
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      transform: 'matrix(1.05, 0, 0, 1.05, -50, -25)',
      opacity: '0.9',
    } as CSSStyleDeclaration);
    const onPulseSettled = vi.fn();
    const { rerender } = render(<Logo position="intro" pulsing onPulseSettled={onPulseSettled} />);
    rerender(<Logo position="intro" pulsing={false} onPulseSettled={onPulseSettled} />);

    const [keyframes] = animate.mock.calls[0] as unknown as [Keyframe[]];
    expect(keyframes[0]).toMatchObject({
      transform: 'scale(1.05) translate(-50%, -50%)',
      transformOrigin: '0 0',
    });
    expect(keyframes[0]).not.toHaveProperty('scale');
    expect(onPulseSettled).not.toHaveBeenCalled();

    // Chromium 69 has no Animation.finished
    await act(async () => settle.onfinish?.call(settle as Animation, {} as AnimationPlaybackEvent));
    expect(onPulseSettled).toHaveBeenCalledTimes(1);
  });

  it('reports settled at once when it never pulsed', () => {
    const onPulseSettled = vi.fn();
    render(<Logo position="intro" onPulseSettled={onPulseSettled} />);
    expect(onPulseSettled).toHaveBeenCalledTimes(1);
  });
});

describe('Logo position', () => {
  it("lines Home's corner up with the cards' margin", () => {
    render(<Logo position="home" homeLeft={123} />);
    expect(logo()).toHaveAttribute('data-position', 'home');
    expect(logo().style.getPropertyValue('--logo-home-left')).toBe('123px');
  });

  it('hides in place for pages with a static logo, then reappears without moving', () => {
    const { rerender } = render(<Logo position="intro" />);
    rerender(<Logo position="none" />);
    expect(logo()).toHaveAttribute('data-hidden');
    expect(logo()).toHaveAttribute('data-position', 'intro');
    // The page's static logo is the one named
    expect(logo()).toHaveAttribute('alt', '');

    rerender(<Logo position="inner" />);
    expect(logo()).not.toHaveAttribute('data-hidden');
    expect(logo()).toHaveAttribute('data-position', 'inner');
    expect(logo()).toHaveAttribute('data-static');

    rerender(<Logo position="home" />);
    expect(logo()).not.toHaveAttribute('data-static');
  });
});
