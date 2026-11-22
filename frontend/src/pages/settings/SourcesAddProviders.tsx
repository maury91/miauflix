import {
  type CatalogArgs,
  useAddCardigannProviderMutation,
  useAddStremioProviderMutation,
  useAddTorznabProviderMutation,
  useLoadDefinitionsMutation,
  useSyncDefinitionsMutation,
} from '@features/sources/api/sources.api';
import type { CardigannDefinitionEntry, CardigannSyncStatus } from '@miauflix/backend';
import {
  ActionGroup,
  Badge,
  Button,
  FilterChip,
  FormSection,
  Heading,
  Message,
  PasswordField,
  ProgressSpinner,
  Section,
  Select,
  Text,
  TextField,
} from '@shared/design-system';
import { useT } from '@shared/i18n';
import { t as translate } from '@shared/i18n';
import { FocusGroup } from '@shared/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { errorMessage } from './sources/errors';
import * as styles from './sources/sources.css';

/** Navigation IDs of the indexer catalog, the Stremio form and the Torznab form. */
const NAV = {
  browse: 'indexers-browse',
  search: 'indexers-search',
  source: 'indexers-source',
  filters: 'indexers-filters',
  filter: (flag: string) => `indexers-filter:${flag}`,
  check: 'indexers-check',
  results: 'indexers-results',
  add: (entry: { source: string; id: string }) => `indexer-add:${entry.source}|${entry.id}`,
  more: 'indexers-more',
  stremioUrl: 'stremio-url',
  stremioSubmit: 'stremio-submit',
  torznabName: 'torznab-name',
  torznabUrl: 'torznab-url',
  torznabKey: 'torznab-key',
  torznabSubmit: 'torznab-submit',
} as const;

const PAGE_SIZE = 40;
const POLL_MS = 4000;
const SEARCH_DEBOUNCE_MS = 250;

type Flag = 'imdb' | 'tmdb' | 'tvdb' | 'movies' | 'tv' | 'anime' | 'publicOnly' | 'supportedOnly';
type Filters = Record<Flag, boolean>;
const FILTERS: Flag[] = [
  'imdb',
  'tmdb',
  'tvdb',
  'movies',
  'tv',
  'anime',
  'publicOnly',
  'supportedOnly',
];
/** IMDb search finds the exact title, and public ones need no account: the sensible start. */
const DEFAULT_FILTERS: Filters = {
  imdb: true,
  tmdb: false,
  tvdb: false,
  movies: false,
  tv: false,
  anime: false,
  publicOnly: true,
  supportedOnly: false,
};

function updatedText(sync: CardigannSyncStatus): string {
  if (sync.syncing)
    return sync.total
      ? translate('indexers.updating', { ready: sync.ready, total: sync.total })
      : translate('indexers.downloading');
  if (!sync.lastSyncAt) return translate('indexers.neverDownloaded');
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(sync.lastSyncAt)) / 60_000));
  const ago =
    minutes < 1
      ? translate('indexers.justNow')
      : minutes < 60
        ? translate('indexers.minutesAgo', { count: minutes })
        : translate('indexers.hoursAgo', { count: Math.round(minutes / 60) });
  const change = sync.lastChange;
  const changes = change
    ? [
        change.added && translate('indexers.added', { count: change.added }),
        change.updated && translate('indexers.changed', { count: change.updated }),
        change.removed && translate('indexers.removed', { count: change.removed }),
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  return translate('indexers.updated', {
    ago,
    changes: changes ? ` (${changes})` : '',
    interval:
      sync.intervalMinutes === 60
        ? translate('indexers.hour')
        : translate('indexers.minutes', { count: sync.intervalMinutes }),
  });
}

function Supports({ entry, showSource }: { entry: CardigannDefinitionEntry; showSource: boolean }) {
  const t = useT();
  const name = entry.name ?? entry.id;
  if (entry.status !== 'ready')
    return (
      <Text variant="caption" tone="secondary">
        {entry.status === 'failed' ? t('indexers.readFailed') : t('indexers.notRead')}
      </Text>
    );
  const { supports } = entry;
  return (
    <>
      {!entry.supported && (
        <Text variant="caption" tone="secondary">
          {entry.reason ?? t('indexers.notSupported')}
        </Text>
      )}
      <span className={styles.badges} aria-label={t('indexers.supports', { name })} role="group">
        {supports.imdb && <Badge tone="success">{t('indexers.filter.imdb')}</Badge>}
        {supports.tmdb && <Badge tone="success">{t('indexers.filter.tmdb')}</Badge>}
        {supports.tvdb && <Badge tone="success">{t('indexers.filter.tvdb')}</Badge>}
        {supports.movies && <Badge>{t('indexers.filter.movies')}</Badge>}
        {supports.tv && <Badge>{t('indexers.filter.tv')}</Badge>}
        {supports.anime && <Badge>{t('indexers.filter.anime')}</Badge>}
        {!supports.imdb && <Badge>{t('indexers.titleOnly')}</Badge>}
        {entry.type && <Badge>{entry.type === 'public' ? t('indexers.public') : entry.type}</Badge>}
        {entry.language && <Badge>{entry.language}</Badge>}
        {entry.requiresFlareSolverr && (
          <Badge tone="warning">{t('indexers.needsFlareSolverr')}</Badge>
        )}
        {showSource && <Badge>{entry.sourceLabel}</Badge>}
      </span>
    </>
  );
}

interface SourcesAddProvidersProps {
  onNotice: (message: string) => void;
}

export default function SourcesAddProviders({ onNotice }: SourcesAddProvidersProps) {
  const t = useT();
  const [browsing, setBrowsing] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [entries, setEntries] = useState<CardigannDefinitionEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [sync, setSync] = useState<CardigannSyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadPage] = useLoadDefinitionsMutation();
  const [syncNow, syncing] = useSyncDefinitionsMutation();
  const [addCardigann, cardigann] = useAddCardigannProviderMutation();
  const [addTorznab, torznab] = useAddTorznabProviderMutation();
  const [form, setForm] = useState({ name: '', baseUrl: '', apiKey: '' });
  const [addStremio, stremio] = useAddStremioProviderMutation();
  const [addonUrl, setAddonUrl] = useState('');
  const resultsRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const hasObserver = typeof IntersectionObserver !== 'undefined';
  const args = useRef<CatalogArgs>({ ...DEFAULT_FILTERS, offset: 0, limit: PAGE_SIZE });
  useLayoutEffect(() => {
    args.current = { ...filters, query, source, offset: 0, limit: PAGE_SIZE };
  }, [filters, query, source]);

  // The search box waits for a pause in typing before asking for results.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  /** Loads a page of the list; offset 0 starts the list over, later offsets append. */
  const load = useCallback(
    async (offset: number) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const page = await loadPage({ ...args.current, offset }).unwrap();
        if (id !== requestId.current) return;
        setError('');
        setTotal(page.total);
        setSync(page.sync);
        setEntries(current => (offset === 0 ? page.entries : [...current, ...page.entries]));
      } catch (requestError) {
        if (id === requestId.current)
          setError(errorMessage(requestError, t('indexers.listFailed')));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [loadPage, t]
  );

  const filterKey = JSON.stringify([query, source, filters]);
  useEffect(() => {
    if (browsing) void load(0);
  }, [browsing, filterKey, load]);

  // While the list is being synced, follow its progress; reload the list once it is done.
  const isSyncing = sync?.syncing ?? false;
  useEffect(() => {
    if (!browsing || !isSyncing) return;
    const timer = setTimeout(() => {
      loadPage({ ...args.current, offset: 0, limit: 0 })
        .unwrap()
        .then(page => {
          setSync(page.sync);
          if (!page.sync.syncing) void load(0);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [browsing, isSyncing, sync, load, loadPage]);

  // Infinite scroll: ask for the next page when the end of the list comes into view.
  const more = entries.length < total;
  const manySources = (sync?.sources.length ?? 0) > 1;
  useEffect(() => {
    const target = sentinelRef.current;
    if (!browsing || !more || loading || error || !target || !hasObserver) return;
    const observer = new IntersectionObserver(
      seen => {
        if (seen.some(item => item.isIntersecting)) void load(entries.length);
      },
      { root: resultsRef.current, rootMargin: '160px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [browsing, more, loading, error, hasObserver, entries.length, load]);

  const install = async (target: CardigannDefinitionEntry) => {
    setError('');
    try {
      const view = await addCardigann({ id: target.id, source: target.source }).unwrap();
      setEntries(current =>
        current.map(entry =>
          entry.id === target.id && entry.source === target.source
            ? { ...entry, installed: true }
            : entry
        )
      );
      onNotice(t('indexers.addedNotice', { name: view.name }));
    } catch (requestError) {
      setError(errorMessage(requestError, t('indexers.addFailed')));
    }
  };

  const checkNow = async () => {
    setError('');
    try {
      setSync(await syncNow().unwrap());
    } catch (requestError) {
      setError(errorMessage(requestError, t('indexers.updateFailed')));
    }
  };

  const submitStremio = async () => {
    if (stremio.isLoading || !addonUrl.trim()) return;
    setError('');
    try {
      const view = await addStremio({ url: addonUrl.trim() }).unwrap();
      setAddonUrl('');
      onNotice(t('indexers.addedNotice', { name: view.name }));
    } catch (requestError) {
      setError(errorMessage(requestError, t('indexers.addonFailed')));
    }
  };

  const submitTorznab = async () => {
    if (torznab.isLoading || !form.name.trim() || !form.baseUrl.trim()) return;
    setError('');
    try {
      const view = await addTorznab({
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
      }).unwrap();
      setForm({ name: '', baseUrl: '', apiKey: '' });
      onNotice(t('indexers.addedNotice', { name: view.name }));
    } catch (requestError) {
      setError(errorMessage(requestError, t('indexers.endpointFailed')));
    }
  };

  return (
    <>
      {error && (
        <Message tone="danger" toneLabel={t('common.error')} live="assertive">
          {error}
        </Message>
      )}
      <div className={styles.setupPart}>
        <Section
          title={t('indexers.jackettTitle')}
          headingLevel={3}
          description={t('indexers.jackettDescription')}
        >
          {!browsing ? (
            <ActionGroup>
              <Button navId={NAV.browse} onClick={() => setBrowsing(true)}>
                {t('indexers.browse')}
              </Button>
            </ActionGroup>
          ) : (
            <FocusGroup layout="vertical">
              <div className={styles.setupFields}>
                <TextField
                  navId={NAV.search}
                  id="definition-search"
                  label={t('indexers.search')}
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="nyaa"
                />
                {sync && manySources && (
                  <Select
                    navId={NAV.source}
                    id="definition-source"
                    label={t('indexers.source')}
                    fullWidth
                    value={source}
                    onChange={setSource}
                    items={[
                      { value: '', label: t('indexers.allSources') },
                      ...sync.sources.map(item => ({
                        value: item.key,
                        label: `${item.label}${item.total ? ` (${item.total})` : ''}`,
                      })),
                    ]}
                  />
                )}
                <FocusGroup id={NAV.filters} layout="horizontal">
                  <div className={styles.filters} role="group" aria-label={t('indexers.filters')}>
                    {FILTERS.map(flag => (
                      <FilterChip
                        key={flag}
                        navId={NAV.filter(flag)}
                        selected={filters[flag]}
                        onSelectedChange={selected =>
                          setFilters(current => ({ ...current, [flag]: selected }))
                        }
                      >
                        {t(`indexers.filter.${flag}`)}
                      </FilterChip>
                    ))}
                  </div>
                </FocusGroup>
                {sync && (
                  <div className={styles.statusLine}>
                    <span role="status">
                      <Text variant="caption" tone="secondary">
                        {updatedText(sync)}
                      </Text>
                    </span>
                    <Button
                      navId={NAV.check}
                      size="sm"
                      disabled={sync.syncing || syncing.isLoading}
                      onClick={() => void checkNow()}
                    >
                      {t('indexers.check')}
                    </Button>
                  </div>
                )}
                {sync?.sources
                  .filter(item => item.lastError)
                  .map(item => (
                    <Message
                      key={item.key}
                      tone="danger"
                      toneLabel={t('common.error')}
                      live="assertive"
                    >
                      {t('indexers.sourceFailed', {
                        source: item.label,
                        error: item.lastError ?? '',
                      })}
                    </Message>
                  ))}
                {sync && sync.failed > 0 && !sync.syncing && (
                  <Message tone="warning" toneLabel={t('common.warning')}>
                    {t('indexers.retrying', { count: sync.failed })}
                  </Message>
                )}
                <FocusGroup id={NAV.results} layout="vertical">
                  <div
                    ref={resultsRef}
                    className={styles.results}
                    role="list"
                    aria-label={t('indexers.available')}
                  >
                    {entries.map(entry => {
                      const unusable = entry.status === 'ready' && !entry.supported;
                      return (
                        <div
                          key={`${entry.source}|${entry.id}`}
                          role="listitem"
                          className={styles.entry}
                        >
                          <div className={styles.entryText}>
                            <Heading level={4} variant="label">
                              {entry.name ?? entry.id}
                              {entry.name && entry.name.toLowerCase() !== entry.id && (
                                <Text as="span" variant="caption" tone="secondary">
                                  {' '}
                                  {entry.id}
                                </Text>
                              )}
                            </Heading>
                            <Supports entry={entry} showSource={manySources} />
                          </div>
                          <Button
                            navId={NAV.add(entry)}
                            size="sm"
                            disabled={entry.installed || unusable || cardigann.isLoading}
                            aria-label={
                              manySources
                                ? t('indexers.addFrom', { id: entry.id, source: entry.sourceLabel })
                                : t('indexers.addId', { id: entry.id })
                            }
                            onClick={() => void install(entry)}
                          >
                            {entry.installed ? t('indexers.addedButton') : t('indexers.add')}
                          </Button>
                        </div>
                      );
                    })}
                    {loading && entries.length === 0 && (
                      <div className={styles.empty}>
                        <ProgressSpinner label={t('indexers.loading')} />
                      </div>
                    )}
                    {more && hasObserver && (
                      <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
                    )}
                    {more && (!hasObserver || error) && (
                      <div role="listitem" className={styles.entry}>
                        <Button
                          navId={NAV.more}
                          size="sm"
                          disabled={loading}
                          onClick={() => void load(entries.length)}
                        >
                          {t('indexers.more')}
                        </Button>
                      </div>
                    )}
                    {!loading && entries.length === 0 && !error && (
                      <div className={styles.empty}>
                        <Text tone="secondary">
                          {sync && sync.total === 0 ? t('indexers.none') : t('indexers.noMatch')}
                        </Text>
                      </div>
                    )}
                  </div>
                </FocusGroup>
                {sync && (
                  <span role="status">
                    <Text variant="caption" tone="secondary">
                      {t('indexers.showing', { shown: entries.length, total })}
                      {sync.total ? t('indexers.inTotal', { count: sync.total }) : ''}
                    </Text>
                  </span>
                )}
              </div>
            </FocusGroup>
          )}
        </Section>
      </div>

      <div className={styles.setupPart}>
        <FormSection
          title={t('indexers.stremioTitle')}
          description={t('indexers.stremioDescription')}
          headingLevel={3}
          onSubmit={() => void submitStremio()}
          busy={stremio.isLoading}
          actions={
            <Button
              type="submit"
              navId={NAV.stremioSubmit}
              loading={stremio.isLoading}
              disabled={!addonUrl.trim()}
            >
              {t('indexers.addAddon')}
            </Button>
          }
        >
          {/* The link can hold the addon's settings and keys: keep it hidden like a password. */}
          <PasswordField
            navId={NAV.stremioUrl}
            id="stremio-url"
            label={t('indexers.stremioUrl')}
            showLabel={t('indexers.showLink')}
            hideLabel={t('indexers.hideLink')}
            autoComplete="off"
            placeholder="https://torrentio.strem.fun/manifest.json"
            value={addonUrl}
            onChange={event => setAddonUrl(event.target.value)}
          />
        </FormSection>
      </div>

      <div className={styles.setupPart}>
        <FormSection
          title={t('indexers.torznabTitle')}
          description={t('indexers.torznabDescription')}
          headingLevel={3}
          onSubmit={() => void submitTorznab()}
          busy={torznab.isLoading}
          actions={
            <Button
              type="submit"
              navId={NAV.torznabSubmit}
              loading={torznab.isLoading}
              disabled={!form.name.trim() || !form.baseUrl.trim()}
            >
              {t('indexers.addEndpoint')}
            </Button>
          }
        >
          <TextField
            navId={NAV.torznabName}
            id="torznab-name"
            label={t('indexers.name')}
            value={form.name}
            onChange={event => setForm({ ...form, name: event.target.value })}
          />
          <TextField
            navId={NAV.torznabUrl}
            id="torznab-url"
            label={t('indexers.url')}
            type="url"
            placeholder="http://jackett:9117/api/v2.0/indexers/all/results/torznab/"
            value={form.baseUrl}
            onChange={event => setForm({ ...form, baseUrl: event.target.value })}
          />
          <PasswordField
            navId={NAV.torznabKey}
            id="torznab-key"
            label={t('indexers.apiKey')}
            showLabel={t('indexers.showKey')}
            hideLabel={t('indexers.hideKey')}
            autoComplete="off"
            value={form.apiKey}
            onChange={event => setForm({ ...form, apiKey: event.target.value })}
          />
        </FormSection>
      </div>
    </>
  );
}
