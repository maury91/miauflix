const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('@logger', () => ({
  logger: { error: mockLoggerError, warn: mockLoggerWarn },
}));

jest.mock(
  'bunqueue-client',
  () => ({
    Worker: jest.fn().mockImplementation((_queue, _processor, options) => ({
      close: jest.fn(),
      on: jest.fn(),
      options,
    })),
  }),
  { virtual: true }
);

import { configureFakerSeed } from '@__test-utils__/utils';
import { Worker } from 'bunqueue-client';

import type { BackgroundJobService } from './background-job.service';
import { BackgroundJobWorker } from './background-job.worker';

describe('BackgroundJobWorker', () => {
  const setupTest = () => {
    const jobs = {
      getConnection: jest.fn(() => ({ host: 'bunqueue', port: 6789 })),
    } as unknown as BackgroundJobService;
    const backgroundWorker = new BackgroundJobWorker(jobs);
    return { jobs, backgroundWorker };
  };

  beforeAll(() => {
    configureFakerSeed();
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps worker heartbeats frequent for jobs with long leases', () => {
    const { backgroundWorker } = setupTest();
    backgroundWorker.register('source.stats', {
      concurrency: 1,
      leaseMs: 15 * 60 * 1000,
      run: jest.fn(),
    });

    backgroundWorker.start();

    expect(Worker).toHaveBeenCalledWith(
      'miauflix-source-stats',
      expect.any(Function),
      expect.objectContaining({ heartbeatIntervalS: 10, lockTtlMs: 15 * 60 * 1000 })
    );
  });

  it('logs retryable and terminal failed attempts without changing broker behavior', () => {
    const { backgroundWorker } = setupTest();
    backgroundWorker.register('source.stats', {
      concurrency: 1,
      run: jest.fn(),
    });

    backgroundWorker.start();
    const worker = (Worker as unknown as jest.Mock).mock.results[0]?.value as { on: jest.Mock };
    const failed = worker.on.mock.calls.find(([event]) => event === 'failed')?.[1] as (
      job: {
        id: string;
        name?: string;
        raw: Record<string, unknown>;
        attempts: number;
        maxAttempts: number;
      },
      error: Error
    ) => void;

    failed(
      {
        id: 'job-1',
        name: 'source.stats',
        raw: { name: 'source.stats' },
        attempts: 1,
        maxAttempts: 12,
      },
      new Error('temporary')
    );
    failed(
      {
        id: 'job-2',
        name: 'source.stats',
        raw: { name: 'source.stats' },
        attempts: 11,
        maxAttempts: 12,
      },
      new Error('permanent')
    );

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'BackgroundJobWorker',
      expect.stringContaining('retryable'),
      expect.objectContaining({ attempt: 2, maxAttempts: 12 })
    );
    expect(mockLoggerError).toHaveBeenCalledWith(
      'BackgroundJobWorker',
      expect.stringContaining('terminal'),
      expect.objectContaining({ attempt: 12, maxAttempts: 12 })
    );
  });
});
