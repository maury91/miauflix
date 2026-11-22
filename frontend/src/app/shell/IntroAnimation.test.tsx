import { render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { IntroAnimation, type LogoAnimationHandle } from './IntroAnimation';

vi.unmock('gsap');

// Some Samsung TVs write the numbers in computed styles with a decimal comma ("10,752px")
vi.hoisted(() => {
  const getComputedStyle = window.getComputedStyle.bind(window);
  const withCommas = (value: unknown) =>
    typeof value === 'string' ? value.replace(/(\d)\.(\d)/g, '$1,$2') : value;
  window.getComputedStyle = (element, pseudo) => {
    const style = getComputedStyle(element, pseudo);
    return new Proxy(style, {
      get(target, property) {
        if (property === 'getPropertyValue')
          return (name: string) => withCommas(target.getPropertyValue(name));
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : withCommas(value);
      },
    });
  };
});

const renderIntro = async () => {
  const ref = createRef<LogoAnimationHandle>();
  const onReady = vi.fn();
  render(<IntroAnimation ref={ref} onReady={onReady} />);
  await waitFor(() => expect(onReady).toHaveBeenCalled());
  return { intro: ref.current!, logo: screen.getByAltText<HTMLImageElement>('Miauwatch logo') };
};

describe('IntroAnimation', () => {
  it('uses the same wordmark as the page logo', async () => {
    const { logo } = await renderIntro();

    expect(logo).toHaveAttribute('src', '/assets/images/logo.svg');
  });

  it('expands the wordmark and restores its initial scale on reset', async () => {
    const { intro, logo } = await renderIntro();
    const scale = () => Number(/scale\(([\d.]+)/.exec(logo.style.transform)?.[1] ?? 1);

    intro.seek(0.25);
    expect(scale()).toBeGreaterThan(1);

    intro.reset();
    expect(scale()).toBe(1);
  });
});
