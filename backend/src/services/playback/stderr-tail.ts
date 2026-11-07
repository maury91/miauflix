import type { Readable } from 'node:stream';

/**
 * Keep the end of a child's stderr (FFmpeg prints why it failed last) without buffering all of it.
 * `limit` counts characters. The stream decodes UTF-8 itself, so a multi-byte character split
 * across chunks is never garbled. Returns a getter for what was kept, trimmed.
 */
export function collectStderr(stream: Readable | null, limit = 2048): () => string {
  let tail = '';
  stream?.setEncoding('utf8');
  stream?.on('data', (chunk: string) => {
    tail = (tail + chunk).slice(-limit);
  });
  return () => tail.trim();
}
