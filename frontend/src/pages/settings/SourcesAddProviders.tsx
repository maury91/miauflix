import {
  type CatalogArgs,
  useAddCardigannProviderMutation,
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
import { FocusGroup } from '@shared/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { errorMessage } from './sources/errors';
import * as styles from './sources/sources.css';

/** Navigation IDs of the indexer catalog and the Torznab form. */
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
const FILTERS: { flag: Flag; label: string }[] = [
  { flag: 'imdb', label: 'IMDb search' },
  { flag: 'tmdb', label: 'TMDB search' },
  { flag: 'tvdb', label: 'TVDB search' },
  { flag: 'movies', label: 'Movies' },
  { flag: 'tv', label: 'TV' },
  { flag: 'anime', label: 'Anime' },
  { flag: 'publicOnly', label: 'Public only' },
  { flag: 'supportedOnly', label: 'Hide unsupported' },
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
      ? `Updating indexers… ${sync.ready} of ${sync.total} read`
      : 'Downloading the indexer list…';
  if (!sync.lastSyncAt) return 'The indexer list has not been downloaded yet.';
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(sync.lastSyncAt)) / 60_000));
  const ago =
    minutes < 1
      ? 'just now'
      : minutes < 60
        ? `${minutes} min ago`
        : `${Math.round(minutes / 60)} h ago`;
  const change = sync.lastChange;
  const changes = change
    ? [
        change.added && `${change.added} added`,
        change.updated && `${change.updated} updated`,
        change.removed && `${change.removed} removed`,
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  return `Updated ${ago}${changes ? ` (${changes})` : ''}. Refreshes every ${
    sync.intervalMinutes === 60 ? 'hour' : `${sync.intervalMinutes} min`
  }.`;
}

function Supports({ entry, showSource }: { entry: CardigannDefinitionEntry; showSource: boolean }) {
  const name = entry.name ?? entry.id;
  if (entry.status !== 'ready')
    return (
      <Text variant="caption" tone="secondary">
        {entry.status === 'failed' ? 'Could not be read yet.' : 'Not read yet.'}
      </Text>
    );
  const { supports } = entry;
  return (
    <>
      {!entry.supported && (
        <Text variant="caption" tone="secondary">
          {entry.reason ?? 'Not supported'}
        </Text>
      )}
      <span className={styles.badges} aria-label={`${name} supports`} role="group">
        {supports.imdb && <Badge tone="success">IMDb search</Badge>}
        {supports.tmdb && <Badge tone="success">TMDB search</Badge>}
        {supports.tvdb && <Badge tone="success">TVDB search</Badge>}
        {supports.movies && <Badge>Movies</Badge>}
        {supports.tv && <Badge>TV</Badge>}
        {supports.anime && <Badge>Anime</Badge>}
        {!supports.imdb && <Badge>Title search only</Badge>}
        {entry.type && <Badge>{entry.type === 'public' ? 'Public' : entry.type}</Badge>}
        {entry.language && <Badge>{entry.language}</Badge>}
        {entry.requiresFlareSolverr && <Badge tone="warning">Needs FlareSolverr</Badge>}
        {showSource && <Badge>{entry.sourceLabel}</Badge>}
      </span>
    </>
  );
}

interface SourcesAddProvidersProps {
  onNotice: (message: string) => void;
}

export default function SourcesAddProviders({ onNotice }: SourcesAddProvidersProps) {
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
          setError(errorMessage(requestError, 'Could not load the indexer list.'));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [loadPage]
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
      onNotice(`Added ${view.name}. Turn it on when you are ready.`);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not add this indexer.'));
    }
  };

  const checkNow = async () => {
    setError('');
    try {
      setSync(await syncNow().unwrap());
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not update the indexer list.'));
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
      onNotice(`Added ${view.name}. Turn it on when you are ready.`);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not add this endpoint.'));
    }
  };

  return (
    <>
      {error && (
        <Message tone="danger" toneLabel="Error" live="assertive">
          {error}
        </Message>
      )}
      <div className={styles.setupPart}>
        <Section
          title="Add Jackett indexer"
          headingLevel={3}
          description="Public indexers from the Jackett definition list, kept up to date automatically. Some need FlareSolverr, and tracker definitions that need an account are not supported."
        >
          {!browsing ? (
            <ActionGroup>
              <Button navId={NAV.browse} onClick={() => setBrowsing(true)}>
                Browse indexers
              </Button>
            </ActionGroup>
          ) : (
            <FocusGroup layout="vertical">
              <div className={styles.setupFields}>
                <TextField
                  navId={NAV.search}
                  id="definition-search"
                  label="Search indexers"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="nyaa"
                />
                {sync && manySources && (
                  <Select
                    navId={NAV.source}
                    id="definition-source"
                    label="Source"
                    fullWidth
                    value={source}
                    onChange={setSource}
                    items={[
                      { value: '', label: 'All sources' },
                      ...sync.sources.map(item => ({
                        value: item.key,
                        label: `${item.label}${item.total ? ` (${item.total})` : ''}`,
                      })),
                    ]}
                  />
                )}
                <FocusGroup id={NAV.filters} layout="horizontal">
                  <div className={styles.filters} role="group" aria-label="Filter indexers">
                    {FILTERS.map(({ flag, label }) => (
                      <FilterChip
                        key={flag}
                        navId={NAV.filter(flag)}
                        selected={filters[flag]}
                        onSelectedChange={selected =>
                          setFilters(current => ({ ...current, [flag]: selected }))
                        }
                      >
                        {label}
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
                      Check for updates
                    </Button>
                  </div>
                )}
                {sync?.sources
                  .filter(item => item.lastError)
                  .map(item => (
                    <Message key={item.key} tone="danger" toneLabel="Error" live="assertive">
                      Last update of {item.label} failed: {item.lastError}
                    </Message>
                  ))}
                {sync && sync.failed > 0 && !sync.syncing && (
                  <Message tone="warning" toneLabel="Warning">
                    {sync.failed} indexers could not be read and will be retried.
                  </Message>
                )}
                <FocusGroup id={NAV.results} layout="vertical">
                  <div
                    ref={resultsRef}
                    className={styles.results}
                    role="list"
                    aria-label="Available indexers"
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
                                ? `Add ${entry.id} from ${entry.sourceLabel}`
                                : `Add ${entry.id}`
                            }
                            onClick={() => void install(entry)}
                          >
                            {entry.installed ? 'Added' : 'Add'}
                          </Button>
                        </div>
                      );
                    })}
                    {loading && entries.length === 0 && (
                      <div className={styles.empty}>
                        <ProgressSpinner label="Loading indexers…" />
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
                          Show more
                        </Button>
                      </div>
                    )}
                    {!loading && entries.length === 0 && !error && (
                      <div className={styles.empty}>
                        <Text tone="secondary">
                          {sync && sync.total === 0
                            ? 'No indexers yet. They appear here once the list has been downloaded.'
                            : 'No indexers match these filters.'}
                        </Text>
                      </div>
                    )}
                  </div>
                </FocusGroup>
                {sync && (
                  <span role="status">
                    <Text variant="caption" tone="secondary">
                      Showing {entries.length} of {total} matching indexers
                      {sync.total ? ` (${sync.total} in total)` : ''}
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
          title="Add Torznab endpoint"
          description="Use an indexer from your own Jackett or Prowlarr."
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
              Add endpoint
            </Button>
          }
        >
          <TextField
            navId={NAV.torznabName}
            id="torznab-name"
            label="Name"
            value={form.name}
            onChange={event => setForm({ ...form, name: event.target.value })}
          />
          <TextField
            navId={NAV.torznabUrl}
            id="torznab-url"
            label="Torznab URL"
            type="url"
            placeholder="http://jackett:9117/api/v2.0/indexers/all/results/torznab/"
            value={form.baseUrl}
            onChange={event => setForm({ ...form, baseUrl: event.target.value })}
          />
          <PasswordField
            navId={NAV.torznabKey}
            id="torznab-key"
            label="API key"
            showLabel="Show API key"
            hideLabel="Hide API key"
            autoComplete="off"
            value={form.apiKey}
            onChange={event => setForm({ ...form, apiKey: event.target.value })}
          />
        </FormSection>
      </div>
    </>
  );
}
