import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SeekControl } from './SeekControl';

describe('SeekControl hover preview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.style.fontSize = '';
  });

  it('places the preview within the bar on the first hover, measured once mounted', () => {
    // A 20px thumb: jsdom sets no root font size
    document.documentElement.style.fontSize = '16px';
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(192);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 1000,
    } as DOMRect);
    render(
      <SeekControl
        label="Seek"
        position={0}
        duration={600}
        onSeek={() => undefined}
        valueText="0 of 10 minutes"
        hoverPreview={seconds => <span>frame at {Math.round(seconds)}</span>}
      />
    );
    const slider = screen.getByRole('slider', { name: 'Seek' });

    // At the far end: the preview's right edge stays on the bar's (1000 - 192). jsdom has no
    // PointerEvent, so the mouse's pointer type is set on the event by hand.
    const move = new MouseEvent('pointermove', { bubbles: true, clientX: 1000 });
    Object.defineProperty(move, 'pointerType', { value: 'mouse' });
    fireEvent(slider.parentElement!, move);

    const preview = screen.getByText('frame at 600').parentElement!;
    expect(preview.style.transform).toBe('translateX(808px)');
  });
});
