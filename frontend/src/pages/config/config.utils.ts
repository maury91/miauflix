import type { ServiceStatuses } from '@features/config/api/config.api';
import type { ConfigEntryView } from '@miauflix/backend';

/**
 * Order groups needing configuration first, then degraded/error services, then the rest.
 * Break ties by service name without reordering the entries within a group.
 */
export function sortServiceGroups(
  groupedEntries: Record<string, ConfigEntryView[]>,
  serviceStatuses: ServiceStatuses = {}
): [string, ConfigEntryView[]][] {
  return Object.entries(groupedEntries).sort(
    ([leftName, leftEntries], [rightName, rightEntries]) => {
      const priority = (name: string, entries: ConfigEntryView[]) => {
        if (
          entries.some(entry => entry.required && !entry.hasValue) ||
          serviceStatuses[name]?.status === 'needs_configuration' ||
          ownMissingVars(name, serviceStatuses[name]?.missingVars, groupedEntries).length > 0
        )
          return 0;
        if (['degraded', 'error'].includes(serviceStatuses[name]?.status ?? '')) return 1;
        return 2;
      };
      const difference = priority(leftName, leftEntries) - priority(rightName, rightEntries);
      if (difference !== 0) return difference;
      return leftName.localeCompare(rightName);
    }
  );
}

/**
 * Keeps service cards in their initial page order while allowing newly introduced groups to appear
 * after the original set. This prevents a successful save from moving the card under the user.
 */
export function preserveInitialServiceOrder(
  sortedGroups: [string, ConfigEntryView[]][],
  initialOrder: string[] | null
): [string, ConfigEntryView[]][] {
  if (!initialOrder) return sortedGroups;

  const groupsByName = new Map(sortedGroups);
  const originalGroups = initialOrder
    .map(serviceName => {
      const entries = groupsByName.get(serviceName);
      return entries ? ([serviceName, entries] as [string, ConfigEntryView[]]) : undefined;
    })
    .filter((group): group is [string, ConfigEntryView[]] => Boolean(group));
  const originalNames = new Set(initialOrder);
  const newGroups = sortedGroups.filter(([serviceName]) => !originalNames.has(serviceName));

  return [...originalGroups, ...newGroups];
}

type ServiceStatus = ServiceStatuses[string];

/** Missing keys that are edited on this service's own card (or on no card at all). */
function ownMissingVars(
  serviceName: string,
  missingVars: string[] = [],
  groupedEntries: Record<string, ConfigEntryView[]>
): string[] {
  return missingVars.filter(key => {
    const owner = findOwnerGroup(key, groupedEntries);
    return !owner || owner === serviceName;
  });
}

function findOwnerGroup(
  key: string,
  groupedEntries: Record<string, ConfigEntryView[]>
): string | undefined {
  return Object.entries(groupedEntries).find(([, entries]) =>
    entries.some(entry => entry.key === key)
  )?.[0];
}

/**
 * A service can be blocked on keys that belong to another card (for example LIST waiting for the
 * shared TRAKT credentials). Rewrite the status message so it points at the card that owns them.
 */
export function attributeMissingVars(
  serviceName: string,
  status: ServiceStatus | undefined,
  groupedEntries: Record<string, ConfigEntryView[]>
): ServiceStatus | undefined {
  if (!status?.missingVars?.length) return status;

  const own = ownMissingVars(serviceName, status.missingVars, groupedEntries);
  const foreign = new Map<string, string[]>();
  for (const key of status.missingVars) {
    if (own.includes(key)) continue;
    const owner = findOwnerGroup(key, groupedEntries)!;
    foreign.set(owner, [...(foreign.get(owner) ?? []), key]);
  }
  if (foreign.size === 0) return status;

  const parts = [
    ...(own.length ? [`Missing required configuration: ${own.join(', ')}`] : []),
    ...[...foreign].map(
      ([owner, keys]) => `Waiting for ${owner} configuration (${keys.join(', ')})`
    ),
  ];
  const message = parts.join('; ');
  return {
    ...status,
    missingVars: own,
    ...(status.reason !== undefined ? { reason: message } : {}),
    ...(status.details !== undefined ? { details: message } : {}),
  };
}
