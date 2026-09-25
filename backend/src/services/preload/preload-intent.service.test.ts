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

  it('keeps a completed preparation while its playable remains wanted', async () => {
    jest.useFakeTimers();
    const prepare = jest.fn().mockResolvedValue({});
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

  it('re-prepares when the requested view increases the preparation level', async () => {
    jest.useFakeTimers();
    const prepare = jest.fn().mockResolvedValue({});
    const service = new PreloadIntentService({ prepare } as never);
    try {
      service.update('user', 'session', 'client', intent(1, 'browse'), 1_000);
      await jest.advanceTimersByTimeAsync(350);
      expect(prepare).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ through: 'metadata' })
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
