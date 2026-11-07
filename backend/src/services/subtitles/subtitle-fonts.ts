/** Fonts embedded in a release, matched to the subtitle style the dialogue uses. */

export interface FontAttachment {
  streamIndex: number;
  filename: string;
}

export interface SubtitleStyle {
  fontName: string;
  bold: boolean;
  italic: boolean;
}

export interface FontNames {
  /** Family, full, PostScript and typographic family names, lowercase. */
  names: string[];
  bold: boolean;
  italic: boolean;
  format: 'otf' | 'ttf';
}

/** Largest font served; CJK fonts reach tens of megabytes. */
export const MAX_FONT_BYTES = 32 * 1024 * 1024;
/** Fonts tried per track before giving up. */
export const MAX_FONT_ATTEMPTS = 24;

const FONT_EXTENSION = /\.(?:ttf|otf|ttc|otc)$/i;
const FONT_MIME = /(?:truetype|opentype|font\/(?:ttf|otf|sfnt|collection)|x-font)/i;

export function isFontAttachment(filename?: string, mimetype?: string): boolean {
  return (!!filename && FONT_EXTENSION.test(filename)) || (!!mimetype && FONT_MIME.test(mimetype));
}

const DIALOGUE_STYLE = /^(?:default|main|dialog(?:ue)?|regular|normal)\b/i;

/**
 * The dialogue style from an ASS/SSA header: `Default` or a similarly named style when there is
 * one, else the first. Signs and songs have their own styles, which plain captions do not show.
 */
export function dialogueStyle(header: string): SubtitleStyle | null {
  let format: string[] | null = null;
  let inStyles = false;
  const styles: Array<Record<string, string>> = [];
  for (const raw of header.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inStyles = /^\[v4\+? styles\]$/i.test(line);
      continue;
    }
    if (!inStyles) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1);
    if (key === 'format') format = value.split(',').map(field => field.trim().toLowerCase());
    else if (key === 'style' && format) {
      const fields = value.split(',');
      // The last field can never contain a comma, but a font name might not either; keep it simple.
      styles.push(
        Object.fromEntries(format.map((name, index) => [name, (fields[index] ?? '').trim()]))
      );
    }
  }
  const style = styles.find(item => DIALOGUE_STYLE.test(item.name ?? '')) ?? styles[0];
  const fontName = style?.fontname?.replace(/^@/, '').trim();
  if (!style || !fontName) return null;
  // ASS uses -1 for true; SSA files sometimes write 1.
  const flag = (value?: string) => value !== undefined && value !== '' && Number(value) !== 0;
  return { fontName, bold: flag(style.bold), italic: flag(style.italic) };
}

function decodeName(bytes: Buffer, platform: number): string {
  if (platform === 0 || platform === 3) {
    let text = '';
    for (let offset = 0; offset + 1 < bytes.length; offset += 2)
      text += String.fromCharCode(bytes.readUInt16BE(offset));
    return text;
  }
  return bytes.toString('latin1');
}

/**
 * Names from an OpenType/TrueType font's `name` table; the first font of a collection.
 * Null when the bytes are not a font, so nothing else is ever served as one.
 */
export function readFontNames(data: Buffer): FontNames | null {
  try {
    let base = 0;
    if (data.toString('latin1', 0, 4) === 'ttcf') base = data.readUInt32BE(12);
    const tag = data.readUInt32BE(base);
    const cff = tag === 0x4f54544f; // 'OTTO'
    if (!cff && tag !== 0x00010000 && tag !== 0x74727565) return null; // 'true'
    const tables = data.readUInt16BE(base + 4);
    let nameOffset = -1;
    let os2Offset = -1;
    for (let index = 0; index < tables; index++) {
      const record = base + 12 + index * 16;
      const name = data.toString('latin1', record, record + 4);
      if (name === 'name') nameOffset = data.readUInt32BE(record + 8);
      if (name === 'OS/2') os2Offset = data.readUInt32BE(record + 8);
    }
    if (nameOffset < 0) return null;
    const count = data.readUInt16BE(nameOffset + 2);
    const strings = nameOffset + data.readUInt16BE(nameOffset + 4);
    const names = new Set<string>();
    let subfamily = '';
    for (let index = 0; index < count; index++) {
      const record = nameOffset + 6 + index * 12;
      const platform = data.readUInt16BE(record);
      const nameId = data.readUInt16BE(record + 6);
      if (![1, 2, 4, 6, 16, 17].includes(nameId) || ![0, 1, 3].includes(platform)) continue;
      const length = data.readUInt16BE(record + 8);
      const start = strings + data.readUInt16BE(record + 10);
      if (start + length > data.length) continue;
      const value = decodeName(data.subarray(start, start + length), platform).trim();
      if (!value) continue;
      if (nameId === 2 || nameId === 17) subfamily ||= value.toLowerCase();
      else names.add(value.toLowerCase());
    }
    if (names.size === 0) return null;
    // OS/2 fsSelection: bit 0 italic, bit 5 bold. Fall back to the subfamily name.
    const selection = os2Offset >= 0 ? data.readUInt16BE(os2Offset + 62) : undefined;
    return {
      names: [...names],
      bold: selection !== undefined ? (selection & 0x20) !== 0 : /bold|black|heavy/.test(subfamily),
      italic: selection !== undefined ? (selection & 0x01) !== 0 : /italic|oblique/.test(subfamily),
      format: cff ? 'otf' : 'ttf',
    };
  } catch {
    return null;
  }
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Attachments whose filename looks like the style's font come first. */
export function orderFontAttachments(
  attachments: FontAttachment[],
  fontName: string
): FontAttachment[] {
  const wanted = normalize(fontName);
  const firstWord = normalize(fontName.split(/\s+/)[0] ?? '');
  const score = (attachment: FontAttachment) => {
    const name = normalize(attachment.filename.replace(/\.[^.]+$/, ''));
    if (!name) return 0;
    if (name === wanted) return 4;
    if (name.startsWith(wanted) || wanted.startsWith(name)) return 3;
    if (firstWord && name.startsWith(firstWord)) return 2;
    if (firstWord && name.includes(firstWord)) return 1;
    return 0;
  };
  return attachments
    .map((attachment, order) => ({ attachment, order, score: score(attachment) }))
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .map(item => item.attachment);
}

/** Whether a font is the style's family, and how closely its weight and slant match. */
export function fontMatch(font: FontNames, style: SubtitleStyle): number | null {
  if (!font.names.includes(style.fontName.toLowerCase())) return null;
  return Number(font.bold === style.bold) + Number(font.italic === style.italic);
}
