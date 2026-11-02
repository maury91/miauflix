import type { ProviderView } from '@miauflix/backend';

const BY_KIND: Record<ProviderView['kind'], string> = {
  cardigann: 'Public source from the Prowlarr/Jackett list',
  torznab: 'Your own Jackett or Prowlarr source',
  http: 'External source',
};

/** What the source says about itself, or a plain description of its kind. */
export function describeProvider(provider: Pick<ProviderView, 'description' | 'kind'>): string {
  return provider.description?.trim() || BY_KIND[provider.kind];
}

/** The usage text for a row: requests used today, or why the source is not being used. */
export function usageLabel(provider: ProviderView): string {
  if (!provider.enabled) return 'Disabled';
  const { today, dailyBudget } = provider.usage;
  return dailyBudget
    ? `${today.toLocaleString()} / ${dailyBudget.toLocaleString()} requests today`
    : `${today.toLocaleString()} requests today`;
}
