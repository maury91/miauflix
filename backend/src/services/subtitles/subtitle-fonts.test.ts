import { buildTestFont, testAssHeader } from '@__test-utils__/font';

import {
  dialogueStyle,
  fontMatch,
  isFontAttachment,
  orderFontAttachments,
  readFontNames,
} from './subtitle-fonts';

describe('subtitle fonts', () => {
  it('picks the dialogue style over signs and songs', () => {
    const header = testAssHeader([
      { name: 'OP', font: 'Lyrics Font' },
      { name: 'Default', font: 'Open Sans Semibold', bold: true },
      { name: 'Sign', font: 'Sign Font' },
    ]);
    expect(dialogueStyle(header)).toEqual({
      fontName: 'Open Sans Semibold',
      bold: true,
      italic: false,
    });
  });

  it('falls back to the first style and ignores vertical-text markers', () => {
    expect(dialogueStyle(testAssHeader([{ name: 'Speech', font: '@Gandhi Sans' }]))).toEqual({
      fontName: 'Gandhi Sans',
      bold: false,
      italic: false,
    });
    expect(dialogueStyle('[Script Info]\nTitle: none\n')).toBeNull();
  });

  it('reads family names and weight from a font, and rejects anything else', () => {
    expect(
      readFontNames(buildTestFont({ family: 'Open Sans', subfamily: 'Bold', bold: true }))
    ).toEqual({
      names: ['open sans', 'open sans bold', 'opensans-bold'],
      bold: true,
      italic: false,
      format: 'ttf',
    });
    expect(readFontNames(buildTestFont({ family: 'Gandhi', cff: true }))?.format).toBe('otf');
    expect(readFontNames(Buffer.from('<html>not a font</html>'))).toBeNull();
    expect(readFontNames(Buffer.alloc(3))).toBeNull();
  });

  it('prefers the face whose weight and slant match the style', () => {
    const style = { fontName: 'Open Sans', bold: true, italic: false };
    const regular = readFontNames(buildTestFont({ family: 'Open Sans' }))!;
    const bold = readFontNames(buildTestFont({ family: 'Open Sans', bold: true }))!;
    const other = readFontNames(buildTestFont({ family: 'Arial' }))!;
    expect(fontMatch(bold, style)).toBeGreaterThan(fontMatch(regular, style)!);
    expect(fontMatch(other, style)).toBeNull();
  });

  it('tries attachments named like the font first', () => {
    const ordered = orderFontAttachments(
      [
        { streamIndex: 3, filename: 'arial.ttf' },
        { streamIndex: 4, filename: 'OpenSans-Bold.ttf' },
        { streamIndex: 5, filename: 'opensans.ttf' },
      ],
      'Open Sans'
    );
    expect(ordered.map(item => item.streamIndex)).toEqual([5, 4, 3]);
  });

  it('recognizes font attachments by name or MIME type', () => {
    expect(isFontAttachment('Font.TTF')).toBe(true);
    expect(isFontAttachment('font.otf')).toBe(true);
    expect(isFontAttachment('cover.jpg', 'image/jpeg')).toBe(false);
    expect(isFontAttachment('', 'application/x-truetype-font')).toBe(true);
    expect(isFontAttachment(undefined, 'application/vnd.ms-opentype')).toBe(true);
  });
});
