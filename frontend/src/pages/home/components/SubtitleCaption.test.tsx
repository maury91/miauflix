import { render, screen } from '@testing-library/react';

import { SubtitleCaption } from './SubtitleCaption';

describe('SubtitleCaption', () => {
  it('sits near the bottom edge without a background while the controls are hidden', () => {
    render(<SubtitleCaption text="Hello" raise={0} data-testid="caption" />);
    const caption = screen.getByTestId('caption');
    expect(caption).toHaveTextContent('Hello');
    expect(caption).toHaveStyle({ bottom: '6vh' });
    expect(getComputedStyle(caption).backgroundColor).toMatch(
      /^(|transparent|rgba\(0, 0, 0, 0\))$/
    );
  });

  it('moves above the open controls', () => {
    render(<SubtitleCaption text="Hello" raise={120} data-testid="caption" />);
    expect(screen.getByTestId('caption')).toHaveStyle({ bottom: 'calc(120px + 1.5vh)' });
  });

  it("draws with the release's font once it has loaded", () => {
    render(
      <SubtitleCaption
        text="Hello"
        raise={0}
        fontFamily="miauflix-subtitle-1"
        data-testid="caption"
      />
    );
    expect(getComputedStyle(screen.getByTestId('caption')).fontFamily).toContain(
      'miauflix-subtitle-1'
    );
  });
});
