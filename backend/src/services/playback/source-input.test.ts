import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';

import type { PlaybackTarget } from './playback-target';
import { openSourceInput } from './source-input';

const target = {
  source: { id: 1 },
  filePath: 'movie.mkv',
  matchKind: 'movie',
} as unknown as PlaybackTarget;

describe('openSourceInput', () => {
  it('tells whether the latest read waits for the file or receives it', async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    const mediaLoad = {
      streamFile: jest.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              async start(controller) {
                await held;
                controller.enqueue(new Uint8Array([1, 2, 3]));
                controller.close();
              },
            }),
            { status: 206 }
          )
      ),
    } as unknown as MediaLoadClientService;
    const states: string[] = [];
    const input = await openSourceInput(mediaLoad, target, false, state => states.push(state));
    try {
      const reading = fetch(input.url, { headers: { range: 'bytes=100-' } });
      while (!states.length) await new Promise(resolve => setTimeout(resolve, 5));
      // The bytes are still being downloaded
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(states).toEqual(['waiting']);
      release();
      const response = await reading;
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
      expect(states).toEqual(['waiting', 'flowing']);
    } finally {
      await input.close();
    }
  });
});
