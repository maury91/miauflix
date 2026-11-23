import { render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { COLLAPSE_DURATION_S, M_CENTERED_X_PERCENT } from './intro/collapsePhase';
import { EXPAND_DURATION_S } from './intro/expandPhase';
import { INTRO_AUDIO_CUES } from './intro/useIntroAudio';
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

const renderIntro = async (props: { logoVisible?: boolean } = {}) => {
  const ref = createRef<LogoAnimationHandle>();
  const onReady = vi.fn();
  const onStart = vi.fn();
  render(<IntroAnimation ref={ref} onReady={onReady} onStart={onStart} {...props} />);
  await waitFor(() => expect(onReady).toHaveBeenCalled());
  const logo = screen.getByLabelText('Miauwatch logo');
  const letters = Array.from(logo.querySelectorAll<SVGElement>('[data-logo-part="letter"]'));
  return { intro: ref.current!, logo, letters, onStart };
};

/** Where the collapse has just ended, as a share of the whole intro (collapse, blink, expand). */
const JUST_COLLAPSED =
  (COLLAPSE_DURATION_S + 0.05) / (COLLAPSE_DURATION_S + INTRO_AUDIO_CUES.meow + EXPAND_DURATION_S);

/** How far the wordmark has moved, in percent of its width. */
const shift = (logo: Element) =>
  Number(
    /translate\(([-\d.]+)%/.exec((logo.parentElement as HTMLElement).style.transform)?.[1] ?? 0
  );

describe('IntroAnimation', () => {
  it('draws the wordmark letter by letter, the cat-shaped M apart', async () => {
    const { logo, letters } = await renderIntro();

    expect(letters.map(letter => letter.dataset['letter'])).toEqual([
      'i',
      'a',
      'u',
      'w',
      'a2',
      't',
      'c',
      'h',
    ]);
    expect(logo.querySelector('[data-logo-part="m"] [data-logo-part="eyes"]')).not.toBeNull();
  });

  it('collapses into the centred M, and returns to the wordmark on reset', async () => {
    const { intro, logo, letters } = await renderIntro();

    intro.seek(JUST_COLLAPSED);
    // Set explicitly: an untouched (empty) opacity would read as 0 too
    expect(letters.map(letter => letter.style.opacity)).toEqual(letters.map(() => '0'));
    expect(shift(logo)).toBeCloseTo(M_CENTERED_X_PERCENT, 1);

    intro.reset();
    expect(letters.every(letter => Number(letter.style.opacity || 1) === 1)).toBe(true);
    expect(shift(logo)).toBe(0);
  });

  it('seeks silently: the expansion start is not announced', async () => {
    const { intro, onStart } = await renderIntro();

    intro.seek(0.95);

    expect(onStart).not.toHaveBeenCalled();
  });

  it('hides the wordmark while the shared logo covers it', async () => {
    const { logo } = await renderIntro({ logoVisible: false });

    expect(logo.parentElement).toHaveStyle({ visibility: 'hidden' });
  });
});
