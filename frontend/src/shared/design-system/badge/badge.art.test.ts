import { RecordingPainter } from '../gl/testing';
import { paintBadge } from './badge.art';
import { badgePremium } from './badge.metrics';

describe('Badge picture', () => {
  it('draws the border, the fill and the uppercase text centred', () => {
    const painter = new RecordingPainter();
    const size = paintBadge(painter, { text: 'Soon', tone: 'warning' }, 8, 8);
    expect(size).toEqual({ width: 46, height: 24 });
    expect(painter.calls).toMatchSnapshot();
  });

  it('fills a premium badge with its dark gold', () => {
    const painter = new RecordingPainter();
    paintBadge(painter, { text: '1080p', tone: 'premium' }, 0, 0);
    const [border, fill, text] = painter.calls as { color?: string; spec?: { color: string } }[];
    expect(border?.color).toBe('rgba(173, 139, 34, 1)');
    expect(fill?.color).toBe('rgba(38, 31, 12, 1)');
    expect(text?.spec?.color).toBe(badgePremium.textColor);
  });

  it('draws nothing until its text is ready', () => {
    const painter = new RecordingPainter({ measure: () => null });
    expect(paintBadge(painter, { text: '4K' }, 0, 0)).toBeNull();
    expect(painter.calls).toEqual([]);
  });
});
