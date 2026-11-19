import { RecordingPainter } from '../gl/testing';
import { paintSpinner } from './spinner.art';

describe('Spinner picture', () => {
  it('draws the ring once at twice its size, into its box', () => {
    const painter = new RecordingPainter();
    paintSpinner(painter, 32, '#a0a0a0', 0, -16);
    expect(painter.calls).toEqual([
      { op: 'canvas', key: 'spinner|64|#a0a0a0', box: [0, -16, 32, 32] },
    ]);
  });
});
