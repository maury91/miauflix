import { render, waitFor } from '@testing-library/react';
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
  const { container } = render(<IntroAnimation ref={ref} onReady={onReady} />);
  await waitFor(() => expect(onReady).toHaveBeenCalled());
  const letters = Array.from(container.querySelectorAll('h1 > svg')) as SVGSVGElement[];
  expect(letters).toHaveLength(8);
  return { intro: ref.current!, letters };
};

describe('IntroAnimation', () => {
  it('places every letter exactly on its box, without its margins', async () => {
    const { letters } = await renderIntro();

    for (const letter of letters) {
      expect(letter.style.marginLeft).toBe('0px');
      expect(letter.style.marginRight).toBe('0px');
    }
  });

  it('grows every letter as the logo expands', async () => {
    const { intro, letters } = await renderIntro();

    intro.seek(0.25);

    for (const letter of letters) {
      const scale = Number(/scale\(([\d.]+)/.exec(letter.style.transform)?.[1]);
      expect(scale).toBeGreaterThan(1);
    }
  });
});
