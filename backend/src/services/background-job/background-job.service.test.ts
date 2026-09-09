const queueAdd = jest.fn();
const queueAddBulk = jest.fn();
const queueSchedule = jest.fn();
const flowAddChain = jest.fn();
const flowAddBulkThen = jest.fn();

jest.mock(
  'bunqueue-client',
  () => ({
    FlowProducer: jest.fn().mockImplementation(() => ({
      addChain: flowAddChain,
      addBulkThen: flowAddBulkThen,
      close: jest.fn(),
    })),
    Queue: jest.fn().mockImplementation(() => ({
      add: queueAdd,
      addBulk: queueAddBulk,
      close: jest.fn(),
      upsertJobScheduler: queueSchedule,
      waitUntilReady: jest.fn().mockResolvedValue(undefined),
    })),
  }),
  { virtual: true }
);

import type { ConfigService } from '@mytypes/configuration';

import { BackgroundJobService } from './background-job.service';

describe('BackgroundJobService', () => {
  const setupTest = () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
      getOrThrow: jest.fn((key: string) => (key === 'BUNQUEUE_PORT' ? 6789 : 'queue')),
      registerService: jest.fn(),
    } as unknown as ConfigService;
    return new BackgroundJobService(config);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queueAdd.mockResolvedValue({});
    queueAddBulk.mockResolvedValue([]);
    queueSchedule.mockResolvedValue(undefined);
    flowAddChain.mockResolvedValue({ jobIds: [] });
    flowAddBulkThen.mockResolvedValue({ parallelIds: [], finalId: 'final' });
  });

  it('adds deterministic durable jobs', async () => {
    const service = setupTest();

    await service.enqueue('source.discover', 'movie:42', { movieMediaId: 42 });
    await service.enqueue('source.discover', 'movie:42', { movieMediaId: 42 });

    expect(queueAdd).toHaveBeenCalledTimes(2);
    expect(queueAdd.mock.calls[0][0]).toBe('source.discover');
    expect(queueAdd.mock.calls[0][1]).toEqual({ movieMediaId: 42 });
    expect(queueAdd.mock.calls[0][2]).toMatchObject({
      attempts: 12,
      durable: true,
      removeOnComplete: true,
    });
    expect(queueAdd.mock.calls[0][2].jobId).toBe(queueAdd.mock.calls[1][2].jobId);
  });

  it('creates ordered and fan-in flows on their typed queues', async () => {
    const service = setupTest();
    const stage = {
      type: 'list.page.stage' as const,
      dedupeKey: 'popular:1:0',
      payload: { slug: 'popular', listId: 1, generation: 'gen-1', page: 0, pageSize: 20 },
    };
    const activate = {
      type: 'list.generation.activate' as const,
      dedupeKey: '1:gen-1',
      payload: { listId: 1, generation: 'gen-1' },
    };

    await service.addChain([stage, activate]);
    await service.addFanIn([stage], activate);

    expect(flowAddChain).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'list.page.stage', queueName: 'miauflix-list-pages' }),
      expect.objectContaining({
        name: 'list.generation.activate',
        queueName: 'miauflix-list-refresh',
      }),
    ]);
    expect(flowAddBulkThen).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'list.page.stage' })],
      expect.objectContaining({ name: 'list.generation.activate' })
    );
  });
});
