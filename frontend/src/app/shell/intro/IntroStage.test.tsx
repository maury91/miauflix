import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { collapsePhase } from './collapsePhase';
import { IntroStage, type IntroStageHandle } from './IntroStage';

vi.unmock('gsap');

const phases = [collapsePhase];

describe('IntroStage', () => {
  it('lets onReady seek through the handle at once', () => {
    const ref = createRef<IntroStageHandle>();
    const onReady = vi.fn(() => ref.current?.seek(1));

    render(<IntroStage ref={ref} phases={phases} onReady={onReady} />);

    expect(onReady).toHaveBeenCalledTimes(1);
    const letters = screen
      .getByRole('img', { name: 'Miauwatch logo' })
      .querySelectorAll<SVGElement>('[data-logo-part="letter"]');
    expect(letters.length).toBeGreaterThan(0);
    expect(Array.from(letters).every(letter => Number(letter.style.opacity) === 0)).toBe(true);
    expect(ref.current?.getProgress()).toBe(1);
  });
});
