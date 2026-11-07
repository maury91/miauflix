import type { Readable } from 'node:stream';

/**
 * Keep the end of a child's stderr (FFmpeg prints why it failed last) without buffering all of it.
 * Returns a getter for what was kept, trimmed.
 */
export function collectStderr(stream: Readable | null, limit = 2048): () => string {
  let tail = '';
  stream?.on('data', (chunk: Buffer) => {
    tail = (tail + chunk.toString()).slice(-limit);
  });
  return () => tail.trim();
}
