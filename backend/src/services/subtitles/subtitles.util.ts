const safeTags = new Set(['b', 'i', 'u', 's', 'ruby', 'rt']);

export function toWebVtt(input: string): string {
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (source.length > 2 * 1024 * 1024) throw new Error('Subtitle file is too large');
  if (/^WEBVTT(?:\s|$)/.test(source)) {
    return sanitizeWebVtt(source);
  }

  const blocks = source.split(/\n{2,}/);
  const cues: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex(line => line.includes('-->'));
    if (timingIndex < 0) continue;
    const timing = lines[timingIndex].match(
      /^\s*(\d{1,2}:)?\d{2}:\d{2}[,.]\d{3}\s+-->\s+(\d{1,2}:)?\d{2}:\d{2}[,.]\d{3}(?:\s+.*)?$/
    );
    if (!timing) continue;
    const [start, end] = lines[timingIndex].split('-->').map(value => value.trim().split(/\s+/)[0]);
    const startMs = parseSrtTime(start);
    const endMs = parseSrtTime(end);
    if (startMs === null || endMs === null || endMs <= startMs) continue;
    const text = lines
      .slice(timingIndex + 1)
      .join('\n')
      .trim();
    if (!text) continue;
    cues.push(`${formatVttTime(startMs)} --> ${formatVttTime(endMs)}\n${sanitizeCueText(text)}`);
    if (cues.length > 10_000) throw new Error('Subtitle file contains too many cues');
  }
  if (!cues.length) throw new Error('Subtitle file contains no valid cues');
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

function sanitizeWebVtt(input: string): string {
  const blocks = input.split(/\n{2,}/);
  const header = blocks.shift() ?? 'WEBVTT';
  if (!/^WEBVTT(?:\s|$)/.test(header) || header.includes('-->')) {
    throw new Error('Invalid WebVTT header');
  }
  const validCues = blocks.filter(block => {
    const timing = block.split('\n').find(line => line.includes('-->'));
    return (
      !!timing &&
      /^\s*(\d{1,2}:)?\d{2}:\d{2}\.\d{3}\s+-->\s+(\d{1,2}:)?\d{2}:\d{2}\.\d{3}(?:\s+.*)?$/.test(
        timing
      )
    );
  });
  if (validCues.length > 10_000) throw new Error('Subtitle file contains too many cues');
  if (!validCues.length) throw new Error('Subtitle file contains no valid cues');
  return `WEBVTT\n\n${validCues.map(block => sanitizeCueText(block)).join('\n\n')}\n`;
}

function sanitizeCueText(text: string): string {
  return text
    .replace(/&(?!amp;|lt;|gt;|nbsp;|lrm;|rlm;)/gi, '&amp;')
    .replace(/<([^>]+)>/g, (match, content: string) => {
      const tag = content.trim().toLowerCase();
      if (safeTags.has(tag.replace(/^\//, ''))) return `<${tag}>`;
      return `&lt;${content}&gt;`;
    });
}

function parseSrtTime(value: string): number | null {
  const match = value.replace(',', '.').match(/^(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + Number(match[4]);
}

function formatVttTime(milliseconds: number): string {
  const value = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor(value / 60_000) % 60;
  const seconds = Math.floor(value / 1000) % 60;
  const millis = value % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
