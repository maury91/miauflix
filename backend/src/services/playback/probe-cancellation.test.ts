jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
jest.mock('./torrent-input', () => ({ openTorrentInput: jest.fn() }));
jest.mock('@logger');

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { TorrentSubtitlesService } from '@services/subtitles/torrent-subtitles.service';

import { AudioPlaybackService } from './audio-playback.service';
import type { PlaybackTarget } from './playback-target';
import { openTorrentInput } from './torrent-input';

const target = (id: number): PlaybackTarget => ({
  source: { id } as PlaybackTarget['source'],
  filePath: 'movie.mkv',
  matchKind: 'movie',
});
const setupTest = () => {
  const children: Array<ReturnType<typeof child>> = [];
  function child() {
    const process = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: jest.fn(() => {
        queueMicrotask(() => process.emit('close', 137));
        return true;
      }),
    });
    return process;
  }
  jest.mocked(spawn).mockImplementation(() => {
    const process = child();
    children.push(process);
    return process as never;
  });
  const close = jest.fn().mockResolvedValue(undefined);
  jest.mocked(openTorrentInput).mockResolvedValue({ url: 'http://127.0.0.1/fixture', close });
  const downloads = {
    getMediaFiles: jest.fn().mockResolvedValue({ files: [{ path: 'movie.mkv', length: 100 }] }),
  };
  return { children, close, downloads };
};
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

afterEach(() => jest.clearAllMocks());

it('kills obsolete audio probes, evicts cancelled cache entries, and admits the next target immediately', async () => {
  const { children, close, downloads } = setupTest();
  const service = new AudioPlaybackService(downloads as never);
  for (let id = 1; id <= 6; id++) {
    const controller = new AbortController();
    const pending = service.inspect(target(id), {}, true, controller.signal).catch(() => undefined);
    await settle();
    expect(children).toHaveLength(id);
    controller.abort();
    expect(children[id - 1].kill).toHaveBeenCalledWith('SIGKILL');
    await pending;
  }
  const controller = new AbortController();
  const retry = service.inspect(target(6), {}, true, controller.signal).catch(() => undefined);
  await settle();
  expect(children).toHaveLength(7);
  controller.abort();
  await retry;
  expect(close).toHaveBeenCalled();
});

it('kills obsolete subtitle probes and releases admission capacity before another focused target', async () => {
  const { children, downloads } = setupTest();
  const service = new TorrentSubtitlesService(downloads as never);
  for (let id = 1; id <= 6; id++) {
    const controller = new AbortController();
    const pending = service.discover(target(id), true, controller.signal);
    await settle();
    expect(children).toHaveLength(id);
    controller.abort();
    expect(children[id - 1].kill).toHaveBeenCalledWith('SIGKILL');
    await pending;
  }
});
