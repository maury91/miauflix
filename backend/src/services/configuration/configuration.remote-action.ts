import { logger } from '@logger';

import { ConfigurationServiceError } from '@errors/configuration.errors';
import { configurationGroups } from '@services/configuration/configuration.consts';

import type { ConfigurationContext } from './configuration.context';
import { missingRemoteValues } from './configuration.remote';
import {
  applyRemoteConsumer,
  probeRemoteConsumer,
  rollbackRemoteConsumers,
  validationFailure,
} from './configuration.runtime';
import {
  saveAndApply,
  unappliedActionResult,
  unappliedSaveResult,
} from './configuration.save-pipeline';
import type {
  ConfigServiceActionResult,
  SaveConfigsResult,
  ServiceName,
  TestConfigsResult,
  VariableName,
} from './configuration.types';
import { applyTransform } from './configuration.utils';

/**
 * Test, or test and save, a configuration group published by remote services (its "consumers").
 *
 * Compared with the local-service action:
 * - unknown or invalid keys are reported as `invalidKeys` instead of thrown;
 * - every consumer receives the full snapshot of its values and tests it without applying it;
 *   the first consumer with a missing required value stops the action;
 * - on save, the snapshot is sent to every consumer, and all of them are reported as restarted;
 * - rollback re-sends each consumer's previous snapshot (or clears it), and a failure to rewrite
 *   config.json while rolling back is logged so the consumers are still rolled back.
 */
export async function runRemoteGroupAction(
  ctx: ConfigurationContext,
  groupName: string,
  entries: { key: string; value: string }[],
  save: boolean
): Promise<SaveConfigsResult | TestConfigsResult> {
  const { store, registeredServices } = ctx;
  const group = configurationGroups[groupName];
  const consumers = ctx.remoteConsumersForGroup(groupName);
  if (!group || consumers.length === 0) {
    throw new ConfigurationServiceError(
      `Configuration group '${groupName}' does not exist`,
      'service_not_found'
    );
  }

  const invalidKeys = entries.filter(({ key }) => !group.variables[key]).map(({ key }) => key);
  for (const { key, value } of entries) {
    if (invalidKeys.includes(key) || !value) continue;
    try {
      applyTransform(key as never, group.variables[key], value);
    } catch {
      invalidKeys.push(key);
    }
  }
  if (invalidKeys.length) {
    return save
      ? unappliedSaveResult(false, [], invalidKeys)
      : { success: false, services: [], invalidKeys };
  }

  const overrides = Object.fromEntries(entries.map(({ key, value }) => [key, value]));
  const snapshots = new Map<ServiceName, Record<string, string>>();
  const previousSnapshots = new Map<ServiceName, Record<string, string> | undefined>();
  for (const consumer of consumers) {
    previousSnapshots.set(consumer, ctx.getServiceConfigSnapshot(consumer));
    const snapshot = ctx.getServiceConfigSnapshot(consumer, overrides);
    if (!snapshot) {
      const missing = missingRemoteValues(ctx.remoteSchema(consumer)!, store.raw, overrides);
      return unappliedActionResult(save, false, [
        validationFailure(consumer, `Missing required values: ${missing.join(', ')}`),
      ]);
    }
    snapshots.set(consumer, snapshot);
  }

  const results: ConfigServiceActionResult[] = [];
  for (const consumer of consumers) {
    results.push(await probeRemoteConsumer(registeredServices, consumer, snapshots.get(consumer)!));
  }
  const success = results.length === consumers.length && results.every(result => result.success);
  if (!success || !save) return unappliedActionResult(save, success, results);

  const attempted: ServiceName[] = [];
  return saveAndApply(
    store,
    {
      results,
      stage() {
        const changed = entries.filter(
          ({ key, value }) => store.raw.get(key as VariableName) !== value
        );
        for (const { key, value } of changed) {
          const variableName = key as VariableName;
          store.raw.set(variableName, value);
          (store.computed as Record<string, unknown>)[key] = applyTransform(
            key as never,
            ctx.variablesInfo.get(variableName) ?? group.variables[key],
            value
          );
          if (value) store.setFileValue(variableName, value);
          else store.removeFileValue(variableName);
        }
        return changed.length > 0;
      },
      async apply(progress) {
        for (const consumer of consumers) {
          progress.applying = consumer;
          // A lost response can happen after the remote service activated the
          // snapshot, so include the in-flight consumer in rollback attempts.
          attempted.push(consumer);
          await applyRemoteConsumer(registeredServices, consumer, snapshots.get(consumer)!);
        }
        return {
          restarted: consumers,
          needsProcessRestart: [],
          changed: [groupName],
          recovered: [],
        };
      },
      rollback: () =>
        rollbackRemoteConsumers(
          registeredServices,
          attempted.reverse(),
          previousSnapshots,
          results,
          {
            rejectedMessage: consumer => `${consumer} did not accept the rollback`,
            logFailures: true,
            markFailed: true,
          }
        ),
      onRollbackSaveError: rollbackError => {
        logger.error(
          'Config',
          'Failed to restore the remote-group configuration file; continuing consumer rollback',
          rollbackError
        );
      },
    },
    () => ctx.notifyChanges()
  );
}
