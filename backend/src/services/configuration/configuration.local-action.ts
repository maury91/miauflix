import { logger } from '@logger';

import { ConfigurationServiceError } from '@errors/configuration.errors';
import type { ServiceInstanceStatus } from '@mytypes/configuration';
import { services } from '@services/configuration/configuration.consts';
import { objectKeys } from '@utils/object.util';

import type { ConfigurationContext } from './configuration.context';
import {
  errorMessage,
  firstErrorLine,
  restoreRuntimeServices,
  serviceStatusMessage,
  untestableResult,
  validationFailure,
} from './configuration.runtime';
import {
  type ApplyOutcome,
  saveAndApply,
  unappliedActionResult,
} from './configuration.save-pipeline';
import type {
  ConfigServiceActionResult,
  EnvironmentVariableTypes,
  SaveConfigsResult,
  ServiceName,
  ServiceRecovery,
  TestConfigsResult,
  VariableName,
} from './configuration.types';
import {
  applyTransform,
  assertKnownConfigKeys,
  computeMissingVarsForGroup,
} from './configuration.utils';

type PreviousStatuses = Map<ServiceName, ServiceInstanceStatus['status']>;

/**
 * Test, or test and save, the configuration of local services (owned by this process).
 *
 * Compared with the remote-group action:
 * - the draft is validated with the variables' own transforms and tested by reloading the live
 *   service against it (or by the service's non-mutating `testConfiguration` when only testing);
 * - services that only failed validation do not stop the others from being tested;
 * - on save, a service already reloaded by its test is not reloaded again, a non-restartable one
 *   is reported as needing a process restart, and services back to `ready` are reported as
 *   recovered;
 * - rollback reloads the changed services against the restored configuration, and a failure to
 *   rewrite config.json while rolling back is thrown.
 */
export async function runLocalServiceAction(
  ctx: ConfigurationContext,
  entries: { key: string; value: string }[],
  requestedServices: ServiceName[],
  save: boolean
): Promise<SaveConfigsResult | TestConfigsResult> {
  assertKnownConfigKeys(entries);
  const uniqueServices = [...new Set(requestedServices)];
  for (const { key } of entries) {
    const serviceName = ctx.variableGroups.get(key);
    if (!serviceName || !uniqueServices.includes(serviceName as ServiceName)) {
      throw new ConfigurationServiceError(
        `Configuration key '${key}' does not belong to the requested service`,
        'unknown_config_key',
        key
      );
    }
  }

  const { store, registeredServices } = ctx;
  const candidateRaw = new Map(store.raw);
  const candidateComputed = { ...store.computed };
  const submittedValues = new Map(entries.map(entry => [entry.key, entry.value]));
  for (const [key, value] of submittedValues) candidateRaw.set(key, value);

  const results: ConfigServiceActionResult[] = [];
  const validServices = uniqueServices.filter(serviceName => {
    const failure = validateLocalCandidate(ctx, serviceName, candidateRaw, candidateComputed);
    if (failure) results.push(failure);
    return !failure;
  });

  const liveTested = new Set<ServiceName>();
  const previousStatuses: PreviousStatuses = new Map();
  await store.withReadView(candidateRaw, candidateComputed, async () => {
    for (const serviceName of validServices) {
      results.push(await testLocalService(ctx, serviceName, save, liveTested, previousStatuses));
    }
  });

  const success = results.every(result => result.success);
  if (!save || !success) {
    await restoreRuntimeServices(registeredServices, liveTested);
    return unappliedActionResult(save, success, results);
  }

  const changedServices = new Set<ServiceName>();
  return saveAndApply(
    store,
    {
      results,
      stage() {
        for (const [key, value] of submittedValues) {
          if (store.raw.get(key) === value) continue;
          const serviceName = ctx.variablesInfo.get(key)?.serviceName;
          if (serviceName) changedServices.add(serviceName);
          if (store.isPersistent) store.setFileValue(key, value);
        }
        store.raw = candidateRaw;
        store.computed = candidateComputed;
        return changedServices.size > 0;
      },
      apply: progress =>
        applyLocalServices(ctx, changedServices, liveTested, previousStatuses, progress),
      rollback: async () => {
        await restoreRuntimeServices(registeredServices, changedServices);
      },
      fallbackFailedService: () => [...changedServices][0],
    },
    () => ctx.notifyChanges()
  );
}

/** Applies the draft's transforms for one service. Returns a failure result, or undefined when valid. */
function validateLocalCandidate(
  ctx: ConfigurationContext,
  serviceName: ServiceName,
  candidateRaw: ReadonlyMap<VariableName, string>,
  candidateComputed: Partial<EnvironmentVariableTypes>
): ConfigServiceActionResult | undefined {
  try {
    const missing = computeMissingVarsForGroup(serviceName, candidateRaw);
    if (missing.length > 0)
      return validationFailure(serviceName, `Missing required values: ${missing.join(', ')}`);

    for (const key of objectKeys(services[serviceName].variables)) {
      const info = ctx.variablesInfo.get(key as VariableName);
      if (!info) continue;
      candidateComputed[key as keyof EnvironmentVariableTypes] = applyTransform(
        key as VariableName,
        info,
        candidateRaw.get(key as VariableName) ?? ''
      ) as never;
    }
    return undefined;
  } catch (error) {
    return validationFailure(serviceName, firstErrorLine(error));
  }
}

/**
 * Tests one service against the draft (must run inside the draft read view). When only testing
 * and the service offers a non-mutating probe, the probe is used; otherwise the service is
 * reloaded and recorded in `liveTested`, so it can be restored or skipped on apply.
 */
async function testLocalService(
  ctx: ConfigurationContext,
  serviceName: ServiceName,
  save: boolean,
  liveTested: Set<ServiceName>,
  previousStatuses: PreviousStatuses
): Promise<ConfigServiceActionResult> {
  const { registeredServices } = ctx;
  const instance = registeredServices.get(serviceName);
  if (!instance?.testable) return untestableResult(serviceName);

  try {
    const observationalTest = !save ? instance.testConfiguration : undefined;
    let ready: boolean;
    let message: string | undefined;
    if (observationalTest) {
      logger.info('Config', `Testing ${serviceName} configuration without applying the draft`);
      const test = await observationalTest.call(instance);
      ready = test.success;
      message = test.message;
    } else {
      liveTested.add(serviceName);
      const previousStatus = instance.getStatus().status;
      previousStatuses.set(serviceName, previousStatus);
      logger.info(
        'Config',
        save
          ? `Restarting ${serviceName} to validate the saved configuration (previous status: ${previousStatus})`
          : `Testing ${serviceName} configuration (previous status: ${previousStatus})`
      );
      await instance.reload();
      ready = instance.getStatus().status === 'ready';
      message = ready ? undefined : serviceStatusMessage(registeredServices, serviceName);
    }
    if (ready) {
      logger.info('Config', `${serviceName} configuration restart completed: ready`);
    } else {
      logger.warn(
        'Config',
        `${serviceName} configuration test failed: ${message ?? serviceStatusMessage(registeredServices, serviceName)}`
      );
    }
    return {
      service: serviceName,
      success: ready,
      testMode: 'live',
      message: ready
        ? (message ?? `${serviceName} test successful.`)
        : (message ?? serviceStatusMessage(registeredServices, serviceName)),
    };
  } catch (error) {
    return { service: serviceName, success: false, testMode: 'live', message: errorMessage(error) };
  }
}

/** Reloads the changed services that the test did not already reload, and reports recoveries. */
async function applyLocalServices(
  ctx: ConfigurationContext,
  changedServices: ReadonlySet<ServiceName>,
  liveTested: ReadonlySet<ServiceName>,
  previousStatuses: PreviousStatuses,
  progress: { applying?: ServiceName }
): Promise<ApplyOutcome> {
  const { registeredServices } = ctx;
  const restarted: ServiceName[] = [];
  const needsProcessRestart: ServiceName[] = [];
  for (const serviceName of changedServices) {
    progress.applying = serviceName;
    if (services[serviceName].restartable === false) {
      needsProcessRestart.push(serviceName);
      continue;
    }
    if (!liveTested.has(serviceName)) {
      const instance = registeredServices.get(serviceName);
      if (instance) {
        const previousStatus = instance.getStatus().status;
        previousStatuses.set(serviceName, previousStatus);
        logger.info(
          'Config',
          `Restarting ${serviceName} after configuration was saved (previous status: ${previousStatus})`
        );
        await instance.reload();
        if (instance.getStatus().status === 'ready') {
          logger.info('Config', `${serviceName} restart completed: ready`);
        } else {
          logger.warn(
            'Config',
            `${serviceName} restart completed without becoming ready: ${serviceStatusMessage(registeredServices, serviceName)}`
          );
        }
      }
    }
    if (registeredServices.has(serviceName)) restarted.push(serviceName);
  }

  const recovered: ServiceRecovery[] = [...changedServices].flatMap(serviceName => {
    const previousStatus = previousStatuses.get(serviceName);
    const status = registeredServices.get(serviceName)?.getStatus().status;
    if (!previousStatus || previousStatus === 'ready' || status !== 'ready') return [];
    logger.info(
      'Config',
      `${serviceName} recovered (${previousStatus} → ready) after configuration was saved`
    );
    return [{ service: serviceName, previousStatus }];
  });

  return { restarted, needsProcessRestart, changed: [...changedServices], recovered };
}
