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

import { Worker } from 'bunqueue-client';

import type { BackgroundJobService } from './background-job.service';
import { BackgroundJobWorker } from './background-job.worker';

describe('BackgroundJobWorker', () => {
  it('keeps worker heartbeats frequent for jobs with long leases', () => {
    const jobs = {
      getConnection: jest.fn(() => ({ host: 'bunqueue', port: 6789 })),
    } as unknown as BackgroundJobService;
    const backgroundWorker = new BackgroundJobWorker(jobs);
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
});
