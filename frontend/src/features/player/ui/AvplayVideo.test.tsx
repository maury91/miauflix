import { parseVtt } from '@features/player/lib/vtt';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AvplayVideo } from './AvplayVideo';

vi.mock('@features/player/lib/avplay-media', () => ({
  AvplayMedia: class {
    currentTime = 0;
    addEventListener() {}
    removeEventListener() {}
    open() {}
    close() {}
  },
}));

describe('AVPlay subtitle rendering', () => {
  it('renders encoded and malformed markup as text without creating elements', () => {
    const cues = parseVtt(
      'WEBVTT\n\n00:00.000 --> 00:03.000\n&lt;img src=x onerror=alert(1)&gt; <script>alert(2)</script > &lt;script'
    );
    render(
      <AvplayVideo
        avplay={{} as never}
        src="/video"
        autoPlay={false}
        mediaRef={() => {}}
        aria-label="Video"
        subtitleCues={cues}
        subtitleOffset={0}
      />
    );
    const caption = screen.getByTestId('avplay-caption');
    expect(caption.textContent).toBe('<img src=x onerror=alert(1)> alert(2) <script');
    expect(caption.querySelector('script, img')).toBeNull();
  });
});
