import { assCues, assEvents } from './ass-subtitles';

const track = [
  '[Script Info]',
  'ScriptType: v4.00+',
  '[V4+ Styles]',
  'Format: Name, Fontname',
  'Dialogue: not an event, a style section line',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:01:10.00,0:01:12.50,Default,,0,0,0,,{\\i1}Hello,{\\i0} there\\Nfriend',
  'Dialogue: 1,0:01:11.00,0:01:15.00,Sign,,0,0,0,,{\\p1}m 0 0 l 10 0 10 10{\\p0}',
  'Dialogue: 0,0:01:20.00,0:01:21.00,Default,,0,0,0,,{\\an8}',
].join('\r\n');

describe('ASS events', () => {
  it('reads only the dialogue lines of the events section', () => {
    const { format, lines } = assEvents(track);
    expect(format).toContain('text');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^Dialogue: 0,0:01:10\.00/);
  });

  it('turns dialogue into plain timed text, skipping drawings and empty lines', () => {
    const { format, lines } = assEvents(track);
    expect(assCues(format, lines)).toEqual([
      { start: 70, end: 72.5, text: 'Hello, there\nfriend' },
    ]);
  });
});
