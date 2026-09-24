import type { ConfigEntryView } from '@miauflix/backend';

export function sortServiceGroups(
  groupedEntries: Record<string, ConfigEntryView[]>
): [string, ConfigEntryView[]][] {
  return Object.entries(groupedEntries).sort(
    ([leftName, leftEntries], [rightName, rightEntries]) => {
      const priority = (entries: ConfigEntryView[]) =>
        entries.some(entry => entry.required && !entry.hasValue) ? 0 : 1;
      const difference = priority(leftEntries) - priority(rightEntries);
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
