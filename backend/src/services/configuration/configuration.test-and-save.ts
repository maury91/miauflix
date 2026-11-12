import { logger } from '@logger';

import { configurationGroups, services } from '@services/configuration/configuration.consts';

import type { ConfigurationContext } from './configuration.context';
import {
  applyRemoteConsumer,
  errorMessage,
  firstErrorLine,
  probeRemoteConsumer,
  restoreRuntimeServices,
  rollbackRemoteConsumers,
  serviceStatusMessage,
  untestableResult,
  validationFailure,
} from './configuration.runtime';
import {
  type ApplyOutcome,
  saveAndApply,
  unappliedSaveResult,
} from './configuration.save-pipeline';
import type {
  ConfigServiceActionResult,
  EnvironmentVariableTypes,
  SaveConfigsResult,
  ServiceName,
  VariableName,
} from './configuration.types';
import { applyTransform, computeMissingVarsForGroup, isServiceName } from './configuration.utils';

type Entry = { key: string; value: string };

/** The draft of a multi-group save, plus which groups and services it touches. */
type Candidate = {
  raw: Map<VariableName, string>;
  computed: Partial<EnvironmentVariableTypes>;
  /** Submitted values by key, as sent to remote services. */
  overrides: Record<string, string>;
  /** Submitted entries grouped by configuration group. */
  groups: Map<string, Entry[]>;
  localGroups: ServiceName[];
  /** Remote groups submitted directly, plus those following a changed DISABLE_VPN_CHECK. */
  remoteGroups: string[];
  /** Remote groups that inherit a changed DISABLE_VPN_CHECK: changed even with no own entry. */
  inheritingGroups: string[];
};

type RemoteSnapshots = {
  next: Map<ServiceName, Record<string, string>>;
  previous: Map<ServiceName, Record<string, string> | undefined>;
};

/**
 * Validate, test and save entries spanning any number of local and remote configuration groups,
 * all or nothing:
 * 1. reject keys that do not belong to a known group;
 * 2. validate the draft of every group (no test runs if one fails);
 * 3. probe every remote consumer and reload every testable local service against the draft,
 *    then restore the local services;
 * 4. save, apply to remote consumers then local services; roll everything back on failure.
 */
export async function testAndSaveConfigs(
  ctx: ConfigurationContext,
  entries: Entry[]
): Promise<SaveConfigsResult> {
  if (!entries.length) return unappliedSaveResult(false, []);

  const { groups, invalidKeys } = groupEntries(ctx, entries);
  if (invalidKeys.length) {
    const rejectedKeys = [...new Set(invalidKeys)];
    return unappliedSaveResult(
      false,
      [
        validationFailure(
          'CONFIGURATION',
          `Unknown or unsupported configuration keys: ${rejectedKeys.join(', ')}`
        ),
      ],
      rejectedKeys
    );
  }

  const candidate = buildCandidate(ctx, entries, groups);
  const results = validateCandidate(ctx, candidate);
  if (results.some(result => !result.success)) return unappliedSaveResult(false, results);

  const remoteSnapshots = collectRemoteSnapshots(ctx, candidate);
  await probeCandidate(ctx, candidate, remoteSnapshots.next, results);
  if (results.some(result => !result.success)) return unappliedSaveResult(false, results);

  const { store, registeredServices } = ctx;
  const changedEntries = entries.filter(
    ({ key, value }) => store.raw.get(key as VariableName) !== value
  );
  const changedGroups = [...groups.entries()]
    .filter(([, groupEntries]) =>
      groupEntries.some(({ key, value }) => store.raw.get(key as VariableName) !== value)
    )
    .map(([groupName]) => groupName);
  const changedGroupSet = new Set([...changedGroups, ...candidate.inheritingGroups]);

  const attempted: ServiceName[] = [];
  return saveAndApply(
    store,
    {
      results,
      stage() {
        if (!changedEntries.length) return false;
        store.raw = candidate.raw;
        store.computed = candidate.computed;
        for (const { key, value } of changedEntries) {
          if (!value) store.removeFileValue(key as VariableName);
          else store.setFileValue(key as VariableName, value);
        }
        return true;
      },
      apply: progress =>
        applyCandidate(ctx, candidate, changedGroupSet, changedGroups, remoteSnapshots.next, {
          progress,
          attempted,
        }),
      async rollback() {
        await rollbackRemoteConsumers(
          registeredServices,
          [...new Set(attempted)].reverse(),
          remoteSnapshots.previous,
          results,
          { rejectedMessage: () => 'rollback rejected', logFailures: false, markFailed: false }
        );
        const failedLocalRestorations = await restoreRuntimeServices(
          registeredServices,
          candidate.localGroups
        );
        for (const serviceName of failedLocalRestorations) {
          const result = results.find(item => item.service === serviceName);
          if (result) {
            result.success = false;
            result.message = `${result.message}; rollback failed: ${serviceName} could not be restored`;
          }
        }
      },
      onRollbackSaveError: rollbackError => {
        logger.error(
          'Config',
          'Failed to restore configuration file after multi-group save',
          rollbackError
        );
      },
    },
    () => ctx.notifyChanges()
  );
}

/** Groups entries by configuration group; keys outside a known local or remote group are invalid. */
export function groupEntries(
  ctx: Pick<ConfigurationContext, 'remoteConsumersForGroup' | 'variableGroups'>,
  entries: Entry[]
): { groups: Map<string, Entry[]>; invalidKeys: string[] } {
  const groups = new Map<string, Entry[]>();
  const invalidKeys: string[] = [];
  for (const entry of entries) {
    const groupName = ctx.variableGroups.get(entry.key as VariableName);
    if (!groupName) {
      invalidKeys.push(entry.key);
      continue;
    }
    const consumers = ctx.remoteConsumersForGroup(groupName);
    const knownLocalGroup = isServiceName(groupName);
    const group = configurationGroups[groupName];
    if ((!consumers.length && !knownLocalGroup) || (consumers.length && !group)) {
      invalidKeys.push(entry.key);
      continue;
    }
    if (group && !group.variables[entry.key]) {
      invalidKeys.push(entry.key);
      continue;
    }
    groups.set(groupName, [...(groups.get(groupName) ?? []), entry]);
  }
  return { groups, invalidKeys };
}

function buildCandidate(
  ctx: ConfigurationContext,
  entries: Entry[],
  groups: Map<string, Entry[]>
): Candidate {
  const { store } = ctx;
  const raw = new Map(store.raw);
  const computed = { ...store.computed };
  const overrides = Object.fromEntries(entries.map(({ key, value }) => [key, value]));
  for (const { key, value } of entries) raw.set(key as VariableName, value);

  // A new DISABLE_VPN_CHECK reaches the remote services that inherit it, as if their own
  // VPN setting had changed.
  const vpnDefaultChanged =
    'DISABLE_VPN_CHECK' in overrides &&
    store.raw.get('DISABLE_VPN_CHECK') !== overrides.DISABLE_VPN_CHECK;
  const inheritingGroups = vpnDefaultChanged
    ? ctx.vpnCheckInheritors(raw).map(({ group }) => group)
    : [];
  const remoteGroups = [
    ...new Set([...[...groups.keys()].filter(group => !isServiceName(group)), ...inheritingGroups]),
  ];
  return {
    raw,
    computed,
    overrides,
    groups,
    localGroups: [...groups.keys()].filter(isServiceName),
    remoteGroups,
    inheritingGroups,
  };
}

/**
 * Transforms every submitted group's draft into `candidate.computed` and checks required values.
 * Returns only failures.
 */
function validateCandidate(
  ctx: ConfigurationContext,
  candidate: Candidate
): ConfigServiceActionResult[] {
  const results: ConfigServiceActionResult[] = [];
  for (const groupName of candidate.groups.keys()) {
    const localService = isServiceName(groupName) ? groupName : undefined;
    const group = configurationGroups[groupName];
    const variables = localService ? services[localService].variables : (group?.variables ?? {});
    try {
      for (const [key, variableInfo] of Object.entries(variables)) {
        const info = ctx.variablesInfo.get(key as VariableName) ?? variableInfo;
        if (info && candidate.raw.has(key as VariableName)) {
          candidate.computed[key as keyof EnvironmentVariableTypes] = applyTransform(
            key as never,
            info,
            candidate.raw.get(key as VariableName) ?? ''
          ) as never;
        }
      }
      if (localService) {
        const missing = computeMissingVarsForGroup(localService, candidate.raw);
        if (missing.length)
          results.push(
            validationFailure(localService, `Missing required values: ${missing.join(', ')}`)
          );
      } else {
        for (const consumer of ctx.remoteConsumersForGroup(groupName)) {
          if (!ctx.getServiceConfigSnapshot(consumer, candidate.overrides)) {
            results.push(validationFailure(consumer, `Missing required values for ${groupName}`));
          }
        }
      }
    } catch (error) {
      results.push(validationFailure(localService ?? groupName, firstErrorLine(error)));
    }
  }
  return results;
}

/** Each remote consumer's draft snapshot, and the one it runs today (for rollback). */
function collectRemoteSnapshots(ctx: ConfigurationContext, candidate: Candidate): RemoteSnapshots {
  const next = new Map<ServiceName, Record<string, string>>();
  const previous = new Map<ServiceName, Record<string, string> | undefined>();
  for (const groupName of candidate.remoteGroups) {
    for (const consumer of ctx.remoteConsumersForGroup(groupName)) {
      const snapshot = ctx.getServiceConfigSnapshot(consumer, candidate.overrides);
      if (snapshot) next.set(consumer, snapshot);
      previous.set(consumer, ctx.getServiceConfigSnapshot(consumer));
    }
  }
  return { next, previous };
}

/**
 * Probes every remote service without applying its candidate. Local services are temporarily
 * reloaded against the candidate, then restored before save. Appends to `results`.
 */
async function probeCandidate(
  ctx: ConfigurationContext,
  candidate: Candidate,
  remoteSnapshots: ReadonlyMap<ServiceName, Record<string, string>>,
  results: ConfigServiceActionResult[]
): Promise<void> {
  const { store, registeredServices } = ctx;
  const { localGroups } = candidate;
  const locallyTested: ServiceName[] = [];
  await store.withReadView(candidate.raw, candidate.computed, async () => {
    for (const [consumer, snapshot] of remoteSnapshots) {
      results.push(await probeRemoteConsumer(registeredServices, consumer, snapshot));
    }

    try {
      for (const serviceName of localGroups) {
        const instance = registeredServices.get(serviceName);
        if (!instance?.testable) {
          results.push(untestableResult(serviceName));
          continue;
        }
        locallyTested.push(serviceName);
        await instance.reload();
        const ready = instance.getStatus().status === 'ready';
        results.push({
          service: serviceName,
          success: ready,
          testMode: 'live',
          message: ready
            ? `${serviceName} test successful.`
            : serviceStatusMessage(registeredServices, serviceName),
        });
      }
    } catch (error) {
      results.push({
        service: locallyTested.at(-1) ?? localGroups[0],
        success: false,
        testMode: 'live',
        message: errorMessage(error),
      });
    }
  });

  const failedProbeRestorations = await restoreRuntimeServices(registeredServices, locallyTested);
  for (const serviceName of failedProbeRestorations) {
    results.push({
      service: serviceName,
      success: false,
      testMode: 'live',
      message: `${serviceName} could not be restored after its configuration probe`,
    });
  }
}

/** Sends the saved draft to each changed remote consumer, then reloads each changed local service. */
async function applyCandidate(
  ctx: ConfigurationContext,
  candidate: Candidate,
  changedGroupSet: ReadonlySet<string>,
  changedGroups: string[],
  remoteSnapshots: ReadonlyMap<ServiceName, Record<string, string>>,
  tracking: { progress: { applying?: ServiceName }; attempted: ServiceName[] }
): Promise<ApplyOutcome> {
  const { registeredServices } = ctx;
  const { progress, attempted } = tracking;
  const restarted: ServiceName[] = [];
  const needsProcessRestart: ServiceName[] = [];

  const attemptedRemote = new Set<ServiceName>();
  for (const groupName of candidate.remoteGroups) {
    if (!changedGroupSet.has(groupName)) continue;
    for (const consumer of ctx.remoteConsumersForGroup(groupName)) {
      if (attemptedRemote.has(consumer)) continue;
      attemptedRemote.add(consumer);
      const snapshot = remoteSnapshots.get(consumer);
      if (!snapshot) continue;
      progress.applying = consumer;
      attempted.push(consumer);
      await applyRemoteConsumer(registeredServices, consumer, snapshot);
      restarted.push(consumer);
    }
  }
  for (const serviceName of candidate.localGroups) {
    if (!changedGroupSet.has(serviceName)) continue;
    if (services[serviceName].restartable === false) {
      needsProcessRestart.push(serviceName);
      continue;
    }
    const instance = registeredServices.get(serviceName);
    if (!instance) continue;
    progress.applying = serviceName;
    await instance.reload();
    restarted.push(serviceName);
  }
  return { restarted, needsProcessRestart, changed: changedGroups, recovered: [] };
}
