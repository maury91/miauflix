import { RecordingPainter } from '../gl/testing';
import { paintMessage } from './message.art';

describe('Message picture', () => {
  it('draws the tone’s icon on the first line, then the text', () => {
    const painter = new RecordingPainter();
    paintMessage(painter, { tone: 'danger', text: 'Failed to load content.' }, 96, 100, 800);
    expect(painter.calls).toMatchSnapshot();
  });
});
