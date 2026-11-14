import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AVPLAY_CAPABILITIES, avplayCapabilities, AvplayMedia } from './avplay-media';

import type { AVPlay, AVPlayListeners, TrackInfo } from '@/types/tizen';

const EVENTS = [
  'loadstart',
  'loadedmetadata',
  'canplay',
  'play',
  'playing',
  'pause',
  'seeking',
  'seeked',
  'timeupdate',
  'waiting',
  'ended',
  'error',
  'emptied',
];

const setupTest = () => {
  let listener: AVPlayListeners = {};
  let prepared: (() => void) | undefined;
  let failed: ((error: unknown) => void) | undefined;
  const avplay = {
    open: vi.fn(),
    close: vi.fn(),
    stop: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    suspend: vi.fn(),
    restore: vi.fn(),
    prepareAsync: vi.fn((onSuccess?: () => void, onError?: (error: unknown) => void) => {
      prepared = onSuccess;
      failed = onError;
    }),
    seekTo: vi.fn((_milliseconds: number, onSuccess?: () => void) => onSuccess?.()),
    getState: vi.fn(() => 'READY' as const),
    getDuration: vi.fn(() => 120_000),
    getCurrentTime: vi.fn(() => 0),
    setDisplayRect: vi.fn(),
    setDisplayMethod: vi.fn(),
    setListener: vi.fn((value: AVPlayListeners) => {
      listener = value;
    }),
    setStreamingProperty: vi.fn(),
    setBufferingParam: vi.fn(),
    getTotalTrackInfo: vi.fn((): TrackInfo[] => [
      { type: 'VIDEO', index: 0, extra_info: '' },
      { type: 'AUDIO', index: 1, extra_info: '' },
      { type: 'AUDIO', index: 2, extra_info: '' },
    ]),
    setSelectTrack: vi.fn(),
  } satisfies AVPlay;
  const media = new AvplayMedia(avplay);
  const events: string[] = [];
  EVENTS.forEach((type: string) => media.addEventListener(type, () => events.push(type)));
  const element = document.createElement('object');
  document.body.appendChild(element);
  return {
    avplay,
    media,
    events,
    element,
    listener: () => listener,
    prepare: () => prepared?.(),
    failPrepare: () => failed?.(new Error('unsupported')),
  };
};

describe('AvplayMedia', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.webapis;
    document.body.innerHTML = '';
  });

  it('opens full screen, prepares and autoplays', () => {
    const { avplay, media, events, element, prepare } = setupTest();
    media.autoplay = true;
    media.open('https://miauflix.example/api/stream/key', element);

    expect(avplay.open).toHaveBeenCalledWith('https://miauflix.example/api/stream/key');
    expect(avplay.setDisplayRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    expect(media.readyState).toBe(0);
    expect(Number.isNaN(media.duration)).toBe(true);

    prepare();
    expect(media.duration).toBe(120);
    expect(media.readyState).toBe(4);
    expect(avplay.play).toHaveBeenCalled();
    expect(media.paused).toBe(false);
    expect(events).toEqual(['loadstart', 'loadedmetadata', 'canplay', 'play', 'playing']);
  });

  it('waits for play() without autoplay, and pauses', async () => {
    const { avplay, media, events, element, prepare } = setupTest();
    media.open('https://miauflix.example/stream', element);
    prepare();
    expect(avplay.play).not.toHaveBeenCalled();
    expect(media.paused).toBe(true);

    await media.play();
    media.pause();
    expect(avplay.pause).toHaveBeenCalled();
    expect(media.paused).toBe(true);
    expect(events.slice(-3)).toEqual(['play', 'playing', 'pause']);
  });

  it('applies a seek made before preparing once prepared', () => {
    const { avplay, media, element, prepare } = setupTest();
    media.open('https://miauflix.example/stream', element);
    media.currentTime = 42.5;
    expect(avplay.seekTo).not.toHaveBeenCalled();
    prepare();
    expect(avplay.seekTo).toHaveBeenCalledWith(42_500, expect.any(Function), expect.any(Function));
    expect(media.currentTime).toBe(42.5);
  });

  it('plays a playlist still being written from the start, at the length it was given', () => {
    const { avplay, media, element, prepare } = setupTest();
    // AVPlay plays an HLS playlist without its end as live: no length, starting near its end.
    avplay.getDuration.mockReturnValue(0);
    media.open('https://miauflix.example/api/stream/key/remux/index.m3u8', element, 3539.5);
    prepare();
    expect(media.duration).toBe(3539.5);
    expect(avplay.seekTo).toHaveBeenCalledWith(0, expect.any(Function), expect.any(Function));
  });

  it('resumes a playlist still being written where it was asked to', () => {
    const { avplay, media, element, prepare } = setupTest();
    avplay.getDuration.mockReturnValue(0);
    media.open('https://miauflix.example/api/stream/key/remux/index.m3u8', element, 3539.5);
    media.currentTime = 409.3;
    prepare();
    expect(avplay.seekTo).toHaveBeenCalledTimes(1);
    expect(avplay.seekTo).toHaveBeenCalledWith(409_300, expect.any(Function), expect.any(Function));
  });

  it('plays a playlist still being written only once the resume seek has landed', () => {
    const { avplay, media, element, prepare } = setupTest();
    avplay.getDuration.mockReturnValue(0);
    let landed: (() => void) | undefined;
    avplay.seekTo.mockImplementation((_milliseconds: number, onSuccess?: () => void) => {
      landed = onSuccess;
    });
    media.autoplay = true;
    // The player resumes when the metadata loads, as usePlaybackProgress does.
    media.addEventListener('loadedmetadata', () => {
      media.currentTime = 851.5;
    });
    media.open('https://miauflix.example/api/stream/key/remux/index.m3u8', element, 3539.5);
    prepare();
    expect(avplay.seekTo).toHaveBeenCalledTimes(1);
    expect(avplay.seekTo).toHaveBeenCalledWith(851_500, expect.any(Function), expect.any(Function));
    expect(avplay.play).not.toHaveBeenCalled();
    landed?.();
    expect(avplay.play).toHaveBeenCalledTimes(1);
  });

  it('opens at the start it is given, seeking before preparing, and plays once prepared', () => {
    const { avplay, media, element, prepare } = setupTest();
    avplay.getDuration.mockReturnValue(0);
    media.autoplay = true;
    // The player resumes at the same place when the metadata loads: nothing left to seek.
    media.addEventListener('loadedmetadata', () => {
      media.currentTime = 851.5;
    });
    media.open('https://miauflix.example/api/stream/key/remux/index.m3u8', element, 3539.5, 851.2);
    expect(avplay.seekTo).toHaveBeenCalledWith(851_200);
    expect(avplay.seekTo.mock.invocationCallOrder[0]).toBeLessThan(
      avplay.prepareAsync.mock.invocationCallOrder[0]
    );
    expect(media.currentTime).toBe(851.2);
    prepare();
    expect(avplay.seekTo).toHaveBeenCalledTimes(1);
    expect(avplay.play).toHaveBeenCalledTimes(1);
    // A later seek to the same place is a real one.
    media.currentTime = 851.5;
    expect(avplay.seekTo).toHaveBeenCalledTimes(2);
  });

  it('seeks to the start once prepared when AVPlay cannot seek before', () => {
    const { avplay, media, element, prepare } = setupTest();
    avplay.getDuration.mockReturnValue(0);
    avplay.seekTo.mockImplementationOnce(() => {
      throw new Error('InvalidStateError');
    });
    media.open('https://miauflix.example/api/stream/key/remux/index.m3u8', element, 3539.5, 600);
    prepare();
    expect(avplay.seekTo).toHaveBeenLastCalledWith(
      600_000,
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('keeps the length AVPlay reports, and its start, for a finished file', () => {
    const { avplay, media, element, prepare } = setupTest();
    media.open('https://miauflix.example/api/stream/key', element, 3539.5);
    prepare();
    expect(media.duration).toBe(120);
    expect(avplay.seekTo).not.toHaveBeenCalled();
  });

  it('buffers a second before playing a TV version, and the default for other streams', () => {
    const { avplay, media, element } = setupTest();
    media.open('https://miauflix.example/api/stream/key/remux/index.m3u8?start=1355', element);
    expect(avplay.setBufferingParam).toHaveBeenCalledWith(
      'PLAYER_BUFFER_FOR_PLAY',
      'PLAYER_BUFFER_SIZE_IN_SECOND',
      1
    );
    expect(avplay.setBufferingParam).toHaveBeenCalledWith(
      'PLAYER_BUFFER_FOR_RESUME',
      'PLAYER_BUFFER_SIZE_IN_SECOND',
      1
    );
    avplay.setBufferingParam.mockClear();
    media.open('https://miauflix.example/api/stream/key', element);
    expect(avplay.setBufferingParam).not.toHaveBeenCalled();
  });

  it('ignores the old position while a seek is in flight', () => {
    const { avplay, media, events, element, prepare, listener } = setupTest();
    let finishSeek: (() => void) | undefined;
    avplay.seekTo.mockImplementation((_milliseconds: number, onSuccess?: () => void) => {
      finishSeek = onSuccess;
    });
    media.open('https://miauflix.example/stream', element);
    prepare();
    media.currentTime = 60;
    vi.advanceTimersByTime(1000);
    listener().oncurrentplaytime?.(5_000);
    expect(media.currentTime).toBe(60);
    finishSeek?.();
    expect(events.slice(-3)).toEqual(['seeking', 'seeked', 'timeupdate']);
    listener().oncurrentplaytime?.(61_000);
    expect(media.currentTime).toBe(61);
  });

  it('throttles timeupdate like a video element', () => {
    const { media, events, element, prepare, listener } = setupTest();
    media.open('https://miauflix.example/stream', element);
    prepare();
    vi.advanceTimersByTime(1000);
    listener().oncurrentplaytime?.(1_000);
    listener().oncurrentplaytime?.(1_100);
    expect(events.filter((type: string) => type === 'timeupdate')).toHaveLength(1);
    expect(media.currentTime).toBe(1.1);
    vi.advanceTimersByTime(250);
    listener().oncurrentplaytime?.(1_350);
    expect(events.filter((type: string) => type === 'timeupdate')).toHaveLength(2);
  });

  it('ends at the end of the file', async () => {
    const { media, events, element, prepare, listener } = setupTest();
    media.open('https://miauflix.example/stream', element);
    prepare();
    await media.play();
    vi.advanceTimersByTime(1000);
    listener().oncurrentplaytime?.(119_000);
    listener().onstreamcompleted?.();
    expect(media.currentTime).toBe(120);
    expect(media.paused).toBe(true);
    expect(events.slice(-3)).toEqual(['timeupdate', 'pause', 'ended']);
  });

  it('reloads a stream that ends early, when the source ran dry', async () => {
    const { avplay, media, events, element, prepare, listener } = setupTest();
    media.open('https://miauflix.example/stream', element);
    prepare();
    await media.play();
    vi.advanceTimersByTime(1000);
    listener().oncurrentplaytime?.(30_000);
    listener().onstreamcompleted?.();
    expect(avplay.suspend).toHaveBeenCalled();
    expect(avplay.restore).toHaveBeenCalled();
    expect(events).not.toContain('ended');
  });

  it('switches to an audio track by its AVPlay index', () => {
    const { avplay, media, element, prepare } = setupTest();
    media.open('https://miauflix.example/stream', element);
    prepare();
    expect(media.audioTracks).toHaveLength(2);
    media.audioTracks[0].enabled = false;
    media.audioTracks[1].enabled = true;
    expect(avplay.setSelectTrack).toHaveBeenCalledWith('AUDIO', 2);
    expect(media.audioTracks[1].enabled).toBe(true);
  });

  it('reports a file AVPlay cannot prepare', () => {
    const { media, events, element, failPrepare } = setupTest();
    media.open('https://miauflix.example/stream', element);
    failPrepare();
    expect(events).toContain('error');
  });

  it('ignores the callbacks of a closed file', () => {
    const { avplay, media, events, element, prepare } = setupTest();
    media.open('https://miauflix.example/stream', element);
    media.close();
    prepare();
    expect(avplay.stop).toHaveBeenCalled();
    expect(avplay.close).toHaveBeenCalled();
    expect(events).not.toContain('loadedmetadata');
    expect(events).toContain('emptied');
  });

  it('plays 4K on a UHD panel', () => {
    const { avplay, media, element } = setupTest();
    window.webapis = { avplay, productinfo: { isUdPanelSupported: () => true } };
    media.open('https://miauflix.example/stream', element);
    expect(avplay.setStreamingProperty).toHaveBeenCalledWith('SET_MODE_4K', 'TRUE');
  });
});

describe('avplayCapabilities', () => {
  afterEach(() => {
    delete window.webapis;
  });

  it('keeps the fixed codec list on a TV that cannot be asked (Tizen 5.5)', () => {
    window.webapis = { avplay: {} as AVPlay };
    expect(avplayCapabilities()).toEqual(AVPLAY_CAPABILITIES);
  });

  it('sends every codec the TV reports, in Samsung names', () => {
    const supported = new Set(['AAC', 'AC3', 'E-AC3', 'TrueHD', 'H264', 'HEVC', 'AV1']);
    window.webapis = {
      avplay: {} as AVPlay,
      systeminfo: {
        isSupportedAudioCodec: codec => supported.has(codec),
        isSupportedVideoCodec: codec => {
          if (codec === 'HEIC') throw new Error('TypeMismatchError');
          return supported.has(codec);
        },
      },
    };
    expect(avplayCapabilities()).toEqual({
      ...AVPLAY_CAPABILITIES,
      tizenCodecs: { audio: ['AC3', 'E-AC3', 'TrueHD', 'AAC'], video: ['H264', 'HEVC', 'AV1'] },
    });
  });
});
