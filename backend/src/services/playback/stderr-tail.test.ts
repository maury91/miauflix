import { PassThrough } from 'node:stream';

import { collectStderr } from './stderr-tail';

describe('collectStderr', () => {
  it('keeps a multi-byte character split across chunks intact', async () => {
    const stream = new PassThrough();
    const tail = collectStderr(stream);
    const bytes = Buffer.from('Errore: è fallito\n');
    const split = bytes.indexOf(0xc3) + 1;
    stream.write(bytes.subarray(0, split));
    stream.end(bytes.subarray(split));
    await new Promise(resolve => stream.on('end', resolve));

    expect(tail()).toBe('Errore: è fallito');
  });

  it('keeps only the last `limit` characters', async () => {
    const stream = new PassThrough();
    const tail = collectStderr(stream, 5);
    stream.end('0123456789');
    await new Promise(resolve => stream.on('end', resolve));

    expect(tail()).toBe('56789');
  });
});
