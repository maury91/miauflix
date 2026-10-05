import type { ConfigEntryView } from '@miauflix/backend';

export type ServiceStatusInfo = {
  status: string;
  reason?: string;
  errorMessage?: string;
  details?: string;
};

export type ServiceStatuses = Record<string, ServiceStatusInfo>;

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
          serviceStatuses[name]?.status === 'needs_configuration'
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
