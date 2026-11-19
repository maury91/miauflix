import { RecordingPainter } from '../gl/testing';
import { paintCarouselEdges } from './carousel.art';

const edges = (canGoBack: boolean, canGoForward: boolean, peek = 40) => {
  const painter = new RecordingPainter();
  paintCarouselEdges(painter, {
    peek,
    width: 1000,
    height: 200,
    surface: 'black',
    canGoBack,
    canGoForward,
  });
  return painter.calls;
};

describe('Carousel edges', () => {
  it('fades only the sides with more to scroll to', () => {
    expect(edges(false, true)).toMatchSnapshot();
    expect(edges(true, true)).toHaveLength(2);
    expect(edges(true, false)).toHaveLength(1);
  });

  it('draws nothing without peeks', () => {
    expect(edges(true, true, 0)).toEqual([]);
  });
});
