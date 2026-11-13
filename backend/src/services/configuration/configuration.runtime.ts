import { logger } from '@logger';

import type { ConfigurableService } from '@mytypes/configuration';
import { services } from '@services/configuration/configuration.consts';

import type { ConfigServiceActionResult, ServiceName } from './configuration.types';

type RegisteredServices = ReadonlyMap<ServiceName, ConfigurableService>;

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** First line of an error message: transform errors append the value, example and suggestions. */
export const firstErrorLine = (error: unknown): string =>
  error instanceof Error ? error.message.split('\n')[0] : String(error);

export const toEntries = (values: Record<string, string>): { key: string; value: string }[] =>
  Object.entries(values).map(([key, value]) => ({ key, value }));

export const validationFailure = (service: string, message: string): ConfigServiceActionResult => ({
  service,
  success: false,
  testMode: 'validation',
  message,
});

/** Result for a local service whose values are valid but that cannot be tested live. */
export const untestableResult = (serviceName: ServiceName): ConfigServiceActionResult => ({
  service: serviceName,
  success: true,
  testMode: 'validation',
  message: `${serviceName} values are valid. A live test is not available for this service.`,
});

/** Human-readable reason a registered service is not ready. */
export function serviceStatusMessage(
  registeredServices: RegisteredServices,
  serviceName: ServiceName
): string {
  const status = registeredServices.get(serviceName)?.getStatus();
  if (!status) return `${serviceName} is not registered for a live test.`;
  if (status.status === 'error') return status.errorMessage;
  if (status.status === 'degraded') return status.reason;
  if (status.status !== 'ready') return status.details;
  return `${serviceName} did not become ready.`;
}

/**
 * Reloads local services so they pick the stored configuration back up after a test or a failed
 * save. Returns the services whose reload threw, and those in `readyBefore` (ready before the
 * test or save) that are not ready afterwards. A service that was already failing before is not
 * counted when it fails again on its old configuration: that would block saving its fix.
 */
export async function restoreRuntimeServices(
  registeredServices: RegisteredServices,
  serviceNames: Iterable<ServiceName>,
  readyBefore: ReadonlySet<ServiceName> = new Set()
): Promise<ServiceName[]> {
  const failed: ServiceName[] = [];
  for (const serviceName of serviceNames) {
    const instance = registeredServices.get(serviceName);
    if (!instance || services[serviceName].restartable === false) continue;
    try {
      const previousStatus = instance.getStatus().status;
      logger.info(
        'Config',
        `Restarting ${serviceName} to restore the previous configuration (previous status: ${previousStatus})`
      );
      await instance.reload();
      if (instance.getStatus().status === 'ready') {
        logger.info('Config', `${serviceName} restoration restart completed: ready`);
      } else {
        if (readyBefore.has(serviceName)) failed.push(serviceName);
        logger.warn(
          'Config',
          `${serviceName} restoration restart completed without becoming ready: ${serviceStatusMessage(registeredServices, serviceName)}`
        );
      }
    } catch (error) {
      failed.push(serviceName);
      console.warn(
        `[Config] Failed to restore ${serviceName} after a configuration test: ${error instanceof Error ? error.message : error}`
      );
    }
  }
  return failed;
}

/** Asks a remote service to test `snapshot` without applying it. */
export async function probeRemoteConsumer(
  registeredServices: RegisteredServices,
  consumer: ServiceName,
  snapshot: Record<string, string>
): Promise<ConfigServiceActionResult> {
  const instance = registeredServices.get(consumer);
  if (!instance?.testConfiguration || !instance.applyConfiguration) {
    return {
      service: consumer,
      success: false,
      testMode: 'live',
      message: `${consumer} is unavailable for configuration testing`,
    };
  }
  try {
    const test = await instance.testConfiguration(toEntries(snapshot));
    return {
      service: consumer,
      success: test.success,
      testMode: test.mode ?? 'live',
      message: test.message,
    };
  } catch (error) {
    return { service: consumer, success: false, testMode: 'live', message: errorMessage(error) };
  }
}

/** Sends `snapshot` to a remote service and throws when it is rejected. */
export async function applyRemoteConsumer(
  registeredServices: RegisteredServices,
  consumer: ServiceName,
  snapshot: Record<string, string>
): Promise<void> {
  const result = await registeredServices.get(consumer)!.applyConfiguration!(toEntries(snapshot));
  if (!result.success) throw new Error(result.message ?? `${consumer} rejected configuration`);
}

export type RemoteRollbackOptions = {
  /** Message used when a consumer rejects the rollback without saying why. */
  rejectedMessage: (consumer: ServiceName) => string;
  /** Log each failed rollback. */
  logFailures: boolean;
  /** Also flip the consumer's result to failed (the note is always appended). */
  markFailed: boolean;
};

/**
 * Puts remote consumers back on the configuration they had before a failed save: the previous
 * snapshot is re-applied, or the configuration is cleared when there was none. A failed rollback
 * is noted on the consumer's result instead of being thrown.
 */
export async function rollbackRemoteConsumers(
  registeredServices: RegisteredServices,
  consumers: ServiceName[],
  previousSnapshots: ReadonlyMap<ServiceName, Record<string, string> | undefined>,
  results: ConfigServiceActionResult[],
  options: RemoteRollbackOptions
): Promise<void> {
  for (const consumer of consumers) {
    const previous = previousSnapshots.get(consumer);
    try {
      const instance = registeredServices.get(consumer);
      const restored = previous
        ? await instance?.applyConfiguration?.(toEntries(previous))
        : await instance?.clearConfiguration?.();
      if (!restored?.success)
        throw new Error(restored?.message ?? options.rejectedMessage(consumer));
    } catch (rollbackError) {
      if (options.logFailures)
        logger.error('Config', `Failed to restore ${consumer} configuration`, rollbackError);
      const failed = results.find(result => result.service === consumer);
      if (failed) {
        if (options.markFailed) failed.success = false;
        failed.message = `${failed.message}; rollback failed: ${errorMessage(rollbackError)}`;
      }
    }
  }
}
