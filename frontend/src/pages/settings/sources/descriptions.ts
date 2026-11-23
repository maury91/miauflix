import type { ProviderView } from '@miauwatch/backend';
import { type MessageKey, t } from '@shared/i18n';

const BY_KIND: Record<ProviderView['kind'], MessageKey> = {
  cardigann: 'sources.kind.cardigann',
  torznab: 'sources.kind.torznab',
  stremio: 'sources.kind.stremio',
  http: 'sources.kind.http',
};

/** What the source says about itself, or a plain description of its kind. */
export function describeProvider(provider: Pick<ProviderView, 'description' | 'kind'>): string {
  return provider.description?.trim() || t(BY_KIND[provider.kind]);
}

/** The usage text for a row: requests used today, or why the source is not being used. */
export function usageLabel(provider: ProviderView): string {
  if (!provider.enabled) return t('sources.disabledUsage');
  const { today, dailyBudget } = provider.usage;
  return dailyBudget
    ? t('sources.usageBudget', {
        today: today.toLocaleString(),
        budget: dailyBudget.toLocaleString(),
      })
    : t('sources.usage', { today: today.toLocaleString() });
}
