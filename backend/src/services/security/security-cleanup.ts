import { logger } from '@logger';

import type { BackgroundJobSchedule } from '@services/background-job/background-job.types';

/** Once a day: the rows involved expire over hours to months. */
const SECURITY_CLEANUP_INTERVAL_SECONDS = 24 * 60 * 60;

export function securitySchedules(): BackgroundJobSchedule[] {
  return [
    {
      job: 'security.cleanup',
      id: 'security-cleanup',
      intervalSeconds: SECURITY_CLEANUP_INTERVAL_SECONDS,
      payload: {},
      priority: 1,
      // Startup clears a backlog left by a long uptime or by versions that never cleaned up.
      runOnStart: true,
    },
  ];
}

/**
 * Delete what only grows otherwise: audit logs past retention, expired QR login requests,
 * refresh tokens and streaming keys. Each task runs even when another one fails; then the job
 * fails if any did, so the queue retries it (the deletes are safe to repeat).
 */
export function createSecurityCleanup(tasks: Record<string, () => Promise<number | void>>) {
  return async (): Promise<void> => {
    const failed: string[] = [];
    for (const [name, task] of Object.entries(tasks)) {
      try {
        const deleted = await task();
        if (typeof deleted === 'number' && deleted > 0) {
          logger.info('SecurityCleanup', `Deleted ${deleted} ${name}`);
        }
      } catch (error) {
        logger.error('SecurityCleanup', `Unable to clean up ${name}`, error);
        failed.push(name);
      }
    }
    if (failed.length > 0) throw new Error(`Security cleanup failed for: ${failed.join(', ')}`);
  };
}
