/** A minimal TrueType font: just the `name` and `OS/2` tables subtitle font matching reads. */
export function buildTestFont({
  family,
  subfamily = 'Regular',
  bold = false,
  italic = false,
  cff = false,
}: {
  family: string;
  subfamily?: string;
  bold?: boolean;
  italic?: boolean;
  cff?: boolean;
}): Buffer {
  const names: Array<[number, string]> = [
    [1, family],
    [2, subfamily],
    [4, `${family} ${subfamily}`],
    [6, `${family.replace(/\s+/g, '')}-${subfamily}`],
  ];
  const strings = names.map(([, value]) => Buffer.from(value, 'utf16le').swap16());
  const nameTable = Buffer.alloc(6 + names.length * 12);
  nameTable.writeUInt16BE(0, 0);
  nameTable.writeUInt16BE(names.length, 2);
  nameTable.writeUInt16BE(nameTable.length, 4);
  let offset = 0;
  names.forEach(([id], index) => {
    const record = 6 + index * 12;
    nameTable.writeUInt16BE(3, record); // Windows
    nameTable.writeUInt16BE(1, record + 2); // Unicode BMP
    nameTable.writeUInt16BE(0x409, record + 4);
    nameTable.writeUInt16BE(id, record + 6);
    nameTable.writeUInt16BE(strings[index].length, record + 8);
    nameTable.writeUInt16BE(offset, record + 10);
    offset += strings[index].length;
  });
  const name = Buffer.concat([nameTable, ...strings]);
  const os2 = Buffer.alloc(96);
  os2.writeUInt16BE((italic ? 0x01 : 0) | (bold ? 0x20 : 0), 62);

  const tables: Array<[string, Buffer]> = [
    ['OS/2', os2],
    ['name', name],
  ];
  const header = Buffer.alloc(12 + tables.length * 16);
  header.writeUInt32BE(cff ? 0x4f54544f : 0x00010000, 0);
  header.writeUInt16BE(tables.length, 4);
  let position = header.length;
  tables.forEach(([tag, data], index) => {
    const record = 12 + index * 16;
    header.write(tag, record, 'latin1');
    header.writeUInt32BE(position, record + 8);
    header.writeUInt32BE(data.length, record + 12);
    position += data.length;
  });
  return Buffer.concat([header, ...tables.map(([, data]) => data)]);
}

export const testAssHeader = (
  styles: Array<{ name: string; font: string; bold?: boolean; italic?: boolean }>
) => `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles
  .map(
    ({ name, font, bold, italic }) =>
      `Style: ${name},${font},72,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,${bold ? -1 : 0},${italic ? -1 : 0},0,0,100,100,0,0,1,3,0,2,10,10,10,1`
  )
  .join('\n')}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
