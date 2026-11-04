export interface SubtitleCue {
  /** Seconds. */
  start: number;
  end: number;
  text: string;
}

const TIMING = /^((?:\d+:)?\d{1,2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}[.,]\d{3})/;
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&lrm;': '‎',
  '&rlm;': '‏',
};

function toSeconds(timestamp: string): number {
  return timestamp
    .replace(',', '.')
    .split(':')
    .reduce((total: number, part: string) => total * 60 + Number(part), 0);
}

/** Tokenize cue text once; VTT tags and annotations end at the next `>`. */
function cueText(source: string): string {
  let text = '';
  let inTag = false;
  for (const character of source) {
    if (character === '<') inTag = true;
    else if (inTag) {
      if (character === '>') inTag = false;
    } else text += character;
  }
  return text.replace(/&(amp|lt|gt|nbsp|lrm|rlm);/g, (entity: string) => ENTITIES[entity]).trim();
}

/**
 * The cues of a WebVTT file as plain text, for players without `<track>`.
 * Entity decoding can produce literal markup: render as text, never as HTML.
 */
export function parseVtt(source: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const block of source.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timingLine = lines.findIndex((line: string) => TIMING.test(line));
    if (timingLine < 0) continue;
    const [, start, end] = TIMING.exec(lines[timingLine])!;
    const text = cueText(lines.slice(timingLine + 1).join('\n'));
    if (text) cues.push({ start: toSeconds(start), end: toSeconds(end), text });
  }
  return cues;
}
