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

/** The cues of a WebVTT file as plain text (tags dropped), for players without `<track>`. */
export function parseVtt(source: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const block of source.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timingLine = lines.findIndex((line: string) => TIMING.test(line));
    if (timingLine < 0) continue;
    const [, start, end] = TIMING.exec(lines[timingLine])!;
    const text = lines
      .slice(timingLine + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&(amp|lt|gt|nbsp|lrm|rlm);/g, (entity: string) => ENTITIES[entity])
      .trim();
    if (text) cues.push({ start: toSeconds(start), end: toSeconds(end), text });
  }
  return cues;
}
