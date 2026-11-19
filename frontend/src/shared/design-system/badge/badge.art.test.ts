import { RecordingPainter } from '../gl/testing';
import { paintBadge } from './badge.art';

describe('Badge picture', () => {
  it('draws the border, the fill and the uppercase text centred', () => {
    const painter = new RecordingPainter();
    const size = paintBadge(painter, { text: 'Soon', tone: 'warning' }, 8, 8);
    expect(size).toEqual({ width: 44, height: 24 });
    expect(painter.calls).toMatchSnapshot();
  });

  it('draws nothing until its text is ready', () => {
    const painter = new RecordingPainter({ measure: () => null });
    expect(paintBadge(painter, { text: '4K' }, 0, 0)).toBeNull();
    expect(painter.calls).toEqual([]);
  });
});
