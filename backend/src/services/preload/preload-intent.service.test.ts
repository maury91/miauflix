import { PreloadIntentService } from './preload-intent.service';

const intent = (sequence: number, view: 'browse' | 'details' | 'player' = 'details') => ({
  sequence,
  view,
  focused: { kind: 'movie' as const, mediaId: 42 },
  reachable: [
    {
      target: { kind: 'movie' as const, mediaId: 9 },
      distance: 1 as const,
      direction: 'right' as const,
    },
    {
      target: { kind: 'movie' as const, mediaId: 9 },
      distance: 2 as const,
      direction: 'left' as const,
    },
  ],
});

const movieIntent = (
  sequence: number,
  mediaId: number,
  view: 'browse' | 'details' | 'player' = 'details'
) => ({
  ...intent(sequence, view),
  focused: { kind: 'movie' as const, mediaId },
});

describe('PreloadIntentService', () => {
  const setupTest = () => ({ service: new PreloadIntentService() });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the newest sequence and deduplicates reachable targets', () => {
    const { service } = setupTest();
    try {
      const first = service.update('user', 'session', 'client', intent(1), 1_000);
      const stale = service.update('user', 'session', 'client', intent(1), 2_000);

      expect(first.accepted).toBe(true);
      expect(stale.accepted).toBe(false);
      expect(service.getActive(2_000)[0]).toMatchObject({ sequence: 1 });
      expect(service.getActive(2_000)[0].reachable).toHaveLength(1);
    } finally {
      service.close();
    }
  });

  it('expires leases without a client cleanup request', () => {
    const { service } = setupTest();
    try {
      service.update('user', 'session', 'client', intent(1), 1_000);
      expect(service.getActive(15_999)).toHaveLength(1);
      expect(service.getActive(16_000)).toHaveLength(0);
    } finally {
      service.close();
    }
  });

  it('does not let an old cleanup remove a newer intent', () => {
    const { service } = setupTest();
    try {
      service.update('user', 'session', 'client', intent(1), 1_000);
      service.update('user', 'session', 'client', intent(2), 1_100);

      expect(service.remove('user', 'session', 'client', 1, 1_200)).toBe(false);
      expect(service.getActive(1_200)[0].sequence).toBe(2);
      expect(service.remove('user', 'session', 'client', 2, 1_300)).toBe(true);
      expect(service.getActive(1_300)).toHaveLength(0);
    } finally {
      service.close();
    }
  });

  it('keeps a completed preparation while its playable remains wanted', async () => {
    jest.useFakeTimers();
    const prepare = jest.fn().mockResolvedValue({ source: { id: 9 } });
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', intent(1), 1_000);
      await jest.advanceTimersByTimeAsync(350);

      service.update('user', 'session', 'client', intent(2), 1_100);
      await jest.advanceTimersByTimeAsync(350);

      expect(prepare).toHaveBeenCalledTimes(1);
    } finally {
      service.close();
    }
  });

  it('keeps pending preparation while a heartbeat requests the same level', async () => {
    jest.useFakeTimers();
    let resolvePreparation: ((value: { source: { id: number } }) => void) | undefined;
    const prepare = jest.fn(
      () =>
        new Promise<{ source: { id: number } }>(resolve => {
          resolvePreparation = resolve;
        })
    );
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', intent(1), 1_000);
      service.update('user', 'session', 'client', intent(2), 1_100);
      await jest.advanceTimersByTimeAsync(350);

      expect(prepare).toHaveBeenCalledTimes(1);
      resolvePreparation?.({ source: { id: 9 } });
      await Promise.resolve();
    } finally {
      service.close();
    }
  });

  it('pauses speculative warmup when the same playable downgrades to browse', async () => {
    jest.useFakeTimers();
    const prepare = jest.fn().mockResolvedValue({
      source: { id: 9, quality: 'FHD', sourceType: 'WEB' },
      warmup: { state: 'warming' },
    });
    const warmup = {
      getState: jest.fn(() => ({
        playableKey: 'm:42',
        leaseKey: 'm:42',
        sourceId: 9,
        state: 'warming',
      })),
      pause: jest.fn().mockResolvedValue(true),
      close: jest.fn(),
    };
    const service = new PreloadIntentService({ prepare } as never, warmup as never);
    try {
      service.update('user', 'session', 'client', intent(1, 'details'), 1_000);
      await jest.advanceTimersByTimeAsync(350);

      const browse = service.update('user', 'session', 'client', intent(2, 'browse'), 1_100);

      expect(warmup.pause).toHaveBeenCalledWith('m:42');
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(browse.preparation).toMatchObject({
        state: 'source_found',
        source: { id: 9, quality: 'FHD', sourceType: 'WEB' },
        warmup: { state: 'not_requested' },
      });
    } finally {
      service.close();
    }
  });

  it('keeps the maximum preparation level across leases for one playable', async () => {
    jest.useFakeTimers();
    const prepare = jest.fn().mockResolvedValue({});
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'details-client', intent(1, 'details'), 1_000);
      service.update('user', 'session', 'browse-client', intent(1, 'browse'), 1_000);
      await jest.advanceTimersByTimeAsync(350);

      expect(prepare).toHaveBeenCalledTimes(1);
      expect(prepare).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ through: 'warm' })
      );
    } finally {
      service.close();
    }
  });

  it('publishes selected source metadata while warmup is unresolved and aborts on browse downgrade', async () => {
    jest.useFakeTimers();
    const source = { id: 9, quality: 'FHD', sourceType: 'WEB' };
    let resolveWarm: ((value: unknown) => void) | undefined;
    const prepare = jest.fn(
      (
        _playable: unknown,
        options: {
          through: string;
          signal?: AbortSignal;
          onSourceSelected?: (selected: unknown) => void;
        }
      ) => {
        options.onSourceSelected?.(source);
        if (options.through === 'warm') {
          return new Promise(resolve => {
            resolveWarm = resolve;
          });
        }
        return Promise.resolve({ source, warmup: { state: 'not_requested' } });
      }
    );
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', intent(1, 'details'), 1_000);
      await jest.advanceTimersByTimeAsync(350);

      const warming = service.update('user', 'session', 'client', intent(2, 'details'), 1_100);
      expect(warming.preparation).toMatchObject({
        state: 'source_found',
        source,
        warmup: { state: 'warming' },
      });

      const browse = service.update('user', 'session', 'client', intent(3, 'browse'), 1_200);
      expect(browse.preparation).toMatchObject({
        state: 'source_found',
        source,
        warmup: { state: 'not_requested' },
      });

      resolveWarm?.({ source, warmup: { state: 'warming' } });
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(350);

      expect(prepare).toHaveBeenCalledTimes(2);
      expect(prepare).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ through: 'sources' })
      );
    } finally {
      service.close();
    }
  });

  it('seeds a later visit from cached metadata and replaces it after refresh', async () => {
    jest.useFakeTimers();
    const sourceA = { id: 9, quality: 'HD', sourceType: 'WEB' };
    const refreshedA = { id: 10, quality: 'FHD', sourceType: 'BLURAY' };
    const resolvers: Array<(value: unknown) => void> = [];
    const prepare = jest.fn((_playable: unknown, _options: unknown) => {
      return new Promise(resolve => resolvers.push(resolve));
    });
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', movieIntent(1, 42), 1_000);
      await jest.advanceTimersByTimeAsync(350);
      resolvers.shift()?.({ source: sourceA, warmup: { state: 'not_requested' } });
      await jest.advanceTimersByTimeAsync(0);

      service.update('user', 'session', 'client', movieIntent(2, 43), 1_100);
      const cached = service.update('user', 'session', 'client', movieIntent(3, 42), 1_200);
      expect(cached.preparation).toMatchObject({ state: 'source_found', source: sourceA });
      expect(prepare).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(350);
      expect(prepare).toHaveBeenCalledTimes(2);
      resolvers.shift()?.({ source: refreshedA, warmup: { state: 'not_requested' } });
      await jest.advanceTimersByTimeAsync(0);

      const refreshed = service.update('user', 'session', 'client', movieIntent(4, 42), 1_300);
      expect(refreshed.preparation).toMatchObject({ state: 'source_found', source: refreshedA });
    } finally {
      service.close();
    }
  });

  it('retains newly selected metadata when subsequent preparation fails', async () => {
    jest.useFakeTimers();
    const source = { id: 10, quality: 'FHD', sourceType: 'WEB' };
    const prepare = jest.fn(
      (_playable: unknown, options: { onSourceSelected?: (source: unknown) => void }) => {
        options.onSourceSelected?.(source);
        return Promise.reject(new Error('warmup failed'));
      }
    );
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', movieIntent(1, 42), 1_000);
      await jest.advanceTimersByTimeAsync(350);
      const result = service.update('user', 'session', 'client', movieIntent(2, 42), 1_100);
      expect(result.preparation).toMatchObject({
        state: 'error',
        source,
        warmup: { state: 'not_requested' },
      });
    } finally {
      service.close();
    }
  });

  it('clears cached metadata after a confirmed no-source refresh', async () => {
    jest.useFakeTimers();
    const source = { id: 9, quality: 'HD', sourceType: 'WEB' };
    const resolvers: Array<(value: unknown) => void> = [];
    const prepare = jest.fn((_playable: unknown, _options: unknown) => {
      return new Promise(resolve => resolvers.push(resolve));
    });
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', movieIntent(1, 42), 1_000);
      await jest.advanceTimersByTimeAsync(350);
      resolvers.shift()?.({ source, warmup: { state: 'not_requested' } });
      await jest.advanceTimersByTimeAsync(0);

      service.update('user', 'session', 'client', movieIntent(2, 43), 1_100);
      service.update('user', 'session', 'client', movieIntent(3, 42), 1_200);
      await jest.advanceTimersByTimeAsync(350);
      resolvers.shift()?.({ source: null, warmup: { state: 'not_requested' } });
      await jest.advanceTimersByTimeAsync(0);

      const noSource = service.update('user', 'session', 'client', movieIntent(4, 42), 1_300);
      expect(noSource.preparation).toMatchObject({ state: 'no_source', source: null });
    } finally {
      service.close();
    }
  });

  it('ignores a stale source callback from an aborted preparation', async () => {
    jest.useFakeTimers();
    const staleSource = { id: 99, quality: '4K', sourceType: 'CAM' };
    let staleCallback: ((source: unknown) => void) | undefined;
    const prepare = jest.fn(
      (_playable: unknown, options: { onSourceSelected?: (source: unknown) => void }) => {
        staleCallback ??= options.onSourceSelected;
        return new Promise(() => {});
      }
    );
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', movieIntent(1, 42), 1_000);
      await jest.advanceTimersByTimeAsync(350);
      service.update('user', 'session', 'client', movieIntent(2, 43), 1_100);
      const current = service.update('user', 'session', 'client', movieIntent(3, 42), 1_200);

      staleCallback?.(staleSource);
      expect(current.preparation).toMatchObject({ state: 'checking', source: null });
    } finally {
      service.close();
    }
  });

  it('reports checking until the focused playable preparation settles', () => {
    const prepare = jest.fn(() => new Promise(() => {}));
    const service = new PreloadIntentService({ prepare } as never);
    try {
      const result = service.update('user', 'session', 'client', intent(1), 1_000);

      expect(result.preparation).toEqual({
        playable: { kind: 'movie', mediaId: 42 },
        state: 'checking',
        source: null,
        warmup: { state: 'not_requested' },
      });
    } finally {
      service.close();
    }
  });

  it('reports source_found only when preparation returns a source', async () => {
    jest.useFakeTimers();
    const prepare = jest.fn().mockResolvedValue({ source: { id: 9 } });
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', intent(1), 1_000);
      await jest.advanceTimersByTimeAsync(350);

      const result = service.update('user', 'session', 'client', intent(2), 1_100);

      expect(result.preparation).toEqual({
        playable: { kind: 'movie', mediaId: 42 },
        state: 'source_found',
        source: { id: 9, quality: null, sourceType: null },
        warmup: { state: 'not_requested' },
      });
    } finally {
      service.close();
    }
  });

  it('reports no_source and retries on the next heartbeat', async () => {
    jest.useFakeTimers();
    const prepare = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ source: { id: 9 } });
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', intent(1), 1_000);
      await jest.advanceTimersByTimeAsync(350);

      const noSource = service.update('user', 'session', 'client', intent(2), 1_100);
      expect(noSource.preparation).toEqual({
        playable: { kind: 'movie', mediaId: 42 },
        state: 'no_source',
        source: null,
        warmup: { state: 'not_requested' },
      });

      await jest.advanceTimersByTimeAsync(350);
      const found = service.update('user', 'session', 'client', intent(3), 1_200);
      expect(prepare).toHaveBeenCalledTimes(2);
      expect(found.preparation?.state).toBe('source_found');
    } finally {
      service.close();
    }
  });

  it('reports preparation errors and retries on the next heartbeat', async () => {
    jest.useFakeTimers();
    const prepare = jest
      .fn()
      .mockRejectedValueOnce(new Error('preparation failed'))
      .mockResolvedValueOnce({});
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', intent(1), 1_000);
      await jest.advanceTimersByTimeAsync(350);

      const error = service.update('user', 'session', 'client', intent(2), 1_100);
      expect(error.preparation).toEqual({
        playable: { kind: 'movie', mediaId: 42 },
        state: 'error',
        source: null,
        warmup: { state: 'not_requested' },
      });

      await jest.advanceTimersByTimeAsync(350);
      expect(prepare).toHaveBeenCalledTimes(2);
    } finally {
      service.close();
    }
  });

  it('correlates snapshots to the accepted focus and preserves them on stale updates', () => {
    const prepare = jest.fn(() => new Promise(() => {}));
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', intent(1), 1_000);
      const changedFocus = service.update(
        'user',
        'session',
        'client',
        { ...intent(2), focused: { kind: 'movie' as const, mediaId: 43 } },
        1_100
      );
      const stale = service.update('user', 'session', 'client', intent(1), 1_200);

      expect(changedFocus.preparation).toEqual({
        playable: { kind: 'movie', mediaId: 43 },
        state: 'checking',
        source: null,
        warmup: { state: 'not_requested' },
      });
      expect(stale.accepted).toBe(false);
      expect(stale.preparation).toEqual(changedFocus.preparation);
    } finally {
      service.close();
    }
  });

  it('does not expose preparation for shows or an unfocused intent', () => {
    const prepare = jest.fn(() => new Promise(() => {}));
    const service = new PreloadIntentService({ prepare } as never);
    try {
      const show = service.update(
        'user',
        'session',
        'client',
        { ...intent(1), focused: { kind: 'show' as const, mediaId: 42 } },
        1_000
      );
      const none = service.update(
        'user',
        'session',
        'client',
        { ...intent(2), focused: null },
        1_100
      );

      expect(show.preparation).toBeNull();
      expect(none.preparation).toBeNull();
    } finally {
      service.close();
    }
  });

  it('re-prepares when the requested view increases the preparation level', async () => {
    jest.useFakeTimers();
    const prepare = jest.fn().mockResolvedValue({});
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', intent(1, 'browse'), 1_000);
      await jest.advanceTimersByTimeAsync(350);
      expect(prepare).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ through: 'sources' })
      );

      service.update('user', 'session', 'client', intent(2, 'details'), 1_100);
      await jest.advanceTimersByTimeAsync(350);

      expect(prepare).toHaveBeenCalledTimes(2);
      expect(prepare).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ through: 'warm' })
      );
    } finally {
      service.close();
    }
  });

  it('allows a failed preparation to retry on the next reconcile', async () => {
    jest.useFakeTimers();
    const prepare = jest
      .fn()
      .mockRejectedValueOnce(new Error('preparation failed'))
      .mockResolvedValueOnce({});
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', intent(1), 1_000);
      await jest.advanceTimersByTimeAsync(350);

      service.update('user', 'session', 'client', intent(2), 1_100);
      await jest.advanceTimersByTimeAsync(350);

      expect(prepare).toHaveBeenCalledTimes(2);
    } finally {
      service.close();
    }
  });
});
