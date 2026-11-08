import { assWindow, toAss } from './subtitles.util';

const header = [
  '[Script Info]',
  'ScriptType: v4.00+',
  'PlayResX: 1920',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize',
  'Style: Default,Miauflix Sans,52',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
].join('\r\n');

describe('ASS delivery', () => {
  it('keeps the header and only the dialogue overlapping the window', () => {
    const body = assWindow(
      `\uFEFF${header}\r\n` +
        'Dialogue: 0,0:00:59.00,0:01:01.50,Default,,0,0,0,,Straddles the start\r\n' +
        'Dialogue: 1,0:01:30.00,0:01:32.00,Default,,0,0,0,,{\\pos(10,20)}Sign, with comma\r\n' +
        'Comment: 0,0:01:30.00,0:01:32.00,Default,,0,0,0,,Note\r\n' +
        'Dialogue: 0,0:03:00.00,0:03:02.00,Default,,0,0,0,,Too late\r\n',
      60,
      180
    );
    expect(body.startsWith('[Script Info]\n')).toBe(true);
    expect(body).toContain('Style: Default,Miauflix Sans,52');
    expect(body).toContain('Straddles the start');
    expect(body).toContain('{\\pos(10,20)}Sign, with comma');
    expect(body).not.toContain('Note');
    expect(body).not.toContain('Too late');
    expect(body).not.toContain('\r');
  });

  it('drops embedded font sections and rejects anything that is not ASS', () => {
    const body = toAss(
      `${header}\n[Fonts]\nfontname: a.ttf\nM8V%\n\n[Events]\nFormat: Start, End, Text\nDialogue: 0:00:01.00,0:00:02.00,Hi\n`
    );
    expect(body).not.toContain('fontname');
    expect(body).toContain('Dialogue: 0:00:01.00,0:00:02.00,Hi');
    expect(() => toAss('WEBVTT\n\n00:00.000 --> 00:01.000\nHi\n')).toThrow('Invalid ASS header');
  });
});
