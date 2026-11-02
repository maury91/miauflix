import {
  type CatalogArgs,
  useAddCardigannProviderMutation,
  useAddTorznabProviderMutation,
  useLoadDefinitionsMutation,
  useSyncDefinitionsMutation,
} from '@features/sources/api/sources.api';
import type { CardigannDefinitionEntry, CardigannSyncStatus } from '@miauflix/backend';
import { ActionRow, Button, FieldLabel, Input, Select } from '@shared/ui';
import { type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import { errorMessage } from './sources/errors';

const Section = styled.section`
  display: grid;
  gap: 12px;
  padding: 18px 0 4px;
  border-top: 1px solid #252b2e;
`;

const Heading = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  text-transform: none;
`;

const Form = styled.form`
  display: grid;
  gap: 12px;
`;

const Field = styled.div`
  display: grid;
  gap: 6px;
`;

const Filters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Chip = styled.button<{ $on: boolean }>`
  padding: 5px 12px;
  border: 1px solid ${({ $on }) => ($on ? '#5c7cfa' : '#3a4246')};
  border-radius: 999px;
  background: ${({ $on }) => ($on ? 'rgba(92, 124, 250, 0.18)' : 'transparent')};
  color: ${({ $on }) => ($on ? '#f5f5f5' : '#a6adaf')};
  font:
    13px 'Poppins',
    sans-serif;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid #5c7cfa;
    outline-offset: 2px;
  }
`;

const Results = styled.div`
  display: grid;
  max-height: 420px;
  overflow-y: auto;
  border: 1px solid #252b2e;
  border-radius: 10px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-top: 1px solid #252b2e;
  overflow-wrap: anywhere;

  &:first-child {
    border-top: 0;
  }
`;

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
`;

const Tag = styled.span<{ $tone?: 'good' | 'warn' }>`
  padding: 1px 8px;
  border: 1px solid
    ${({ $tone }) => ($tone === 'good' ? '#2e6b53' : $tone === 'warn' ? '#6b5a2e' : '#3a4246')};
  border-radius: 999px;
  color: ${({ $tone }) =>
    $tone === 'good' ? '#6fd3a8' : $tone === 'warn' ? '#e5b95c' : '#a6adaf'};
  font-size: 11px;
`;

const Sentinel = styled.div`
  height: 1px;
`;

const Message = styled.p`
  margin: 0;
  color: #a6adaf;
  font-size: 13px;
  line-height: 1.5;
`;

const StatusLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
`;

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
      <Message>{entry.status === 'failed' ? 'Could not be read yet.' : 'Not read yet.'}</Message>
    );
  const { supports } = entry;
  return (
    <>
      {!entry.supported && <Message>{entry.reason ?? 'Not supported'}</Message>}
      <Tags aria-label={`${name} supports`}>
        {supports.imdb && <Tag $tone="good">IMDb search</Tag>}
        {supports.tmdb && <Tag $tone="good">TMDB search</Tag>}
        {supports.tvdb && <Tag $tone="good">TVDB search</Tag>}
        {supports.movies && <Tag>Movies</Tag>}
        {supports.tv && <Tag>TV</Tag>}
        {supports.anime && <Tag>Anime</Tag>}
        {!supports.imdb && <Tag>Title search only</Tag>}
        {entry.type && <Tag>{entry.type === 'public' ? 'Public' : entry.type}</Tag>}
        {entry.language && <Tag>{entry.language}</Tag>}
        {entry.requiresFlareSolverr && <Tag $tone="warn">Needs FlareSolverr</Tag>}
        {showSource && <Tag>{entry.sourceLabel}</Tag>}
      </Tags>
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

  const submitTorznab = async (event: FormEvent) => {
    event.preventDefault();
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
      {error && <Message role="alert">{error}</Message>}
      <Section aria-label="Add Jackett indexer">
        <Heading>Add Jackett indexer</Heading>
        <Message>
          Public indexers from the Jackett definition list, kept up to date automatically. Some need
          FlareSolverr, and tracker definitions that need an account are not supported.
        </Message>
        {!browsing ? (
          <ActionRow>
            <Button
              size="small"
              appearance="settings"
              color="secondary"
              onClick={() => setBrowsing(true)}
            >
              Browse indexers
            </Button>
          </ActionRow>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="definition-search">Search indexers</FieldLabel>
              <Input
                id="definition-search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="nyaa"
              />
            </Field>
            {sync && manySources && (
              <Field>
                <FieldLabel htmlFor="definition-source">Source</FieldLabel>
                <Select
                  id="definition-source"
                  value={source}
                  onChange={event => setSource(event.target.value)}
                >
                  <option value="">All sources</option>
                  {sync.sources.map(item => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                      {item.total ? ` (${item.total})` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Filters role="group" aria-label="Filter indexers">
              {FILTERS.map(({ flag, label }) => (
                <Chip
                  key={flag}
                  type="button"
                  $on={filters[flag]}
                  aria-pressed={filters[flag]}
                  onClick={() => setFilters(current => ({ ...current, [flag]: !current[flag] }))}
                >
                  {label}
                </Chip>
              ))}
            </Filters>
            {sync && (
              <StatusLine>
                <Message role="status">{updatedText(sync)}</Message>
                <Button
                  size="small"
                  appearance="settings"
                  color="secondary"
                  disabled={sync.syncing || syncing.isLoading}
                  onClick={() => void checkNow()}
                >
                  Check for updates
                </Button>
              </StatusLine>
            )}
            {sync?.sources
              .filter(item => item.lastError)
              .map(item => (
                <Message key={item.key} role="alert">
                  Last update of {item.label} failed: {item.lastError}
                </Message>
              ))}
            {sync && sync.failed > 0 && !sync.syncing && (
              <Message>{sync.failed} indexers could not be read and will be retried.</Message>
            )}
            <Results ref={resultsRef} role="list" aria-label="Available indexers">
              {entries.map(entry => {
                const unusable = entry.status === 'ready' && !entry.supported;
                return (
                  <Row key={`${entry.source}|${entry.id}`} role="listitem">
                    <div>
                      <strong>{entry.name ?? entry.id}</strong>
                      {entry.name && entry.name.toLowerCase() !== entry.id && (
                        <Message as="span"> {entry.id}</Message>
                      )}
                      <Supports entry={entry} showSource={manySources} />
                    </div>
                    <Button
                      size="small"
                      appearance="settings"
                      color="secondary"
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
                  </Row>
                );
              })}
              {loading && entries.length === 0 && (
                <Message role="status">Loading indexers…</Message>
              )}
              {more && hasObserver && <Sentinel ref={sentinelRef} aria-hidden="true" />}
              {more && (!hasObserver || error) && (
                <Row role="listitem">
                  <Button
                    size="small"
                    appearance="settings"
                    color="secondary"
                    disabled={loading}
                    onClick={() => void load(entries.length)}
                  >
                    Show more
                  </Button>
                </Row>
              )}
              {!loading && entries.length === 0 && !error && (
                <Message>
                  {sync && sync.total === 0
                    ? 'No indexers yet. They appear here once the list has been downloaded.'
                    : 'No indexers match these filters.'}
                </Message>
              )}
            </Results>
            {sync && (
              <Message role="status">
                Showing {entries.length} of {total} matching indexers
                {sync.total ? ` (${sync.total} in total)` : ''}
              </Message>
            )}
          </>
        )}
      </Section>

      <Section aria-label="Add Torznab endpoint">
        <Heading>Add Torznab endpoint</Heading>
        <Message>Use an indexer from your own Jackett or Prowlarr.</Message>
        <Form onSubmit={event => void submitTorznab(event)}>
          <Field>
            <FieldLabel htmlFor="torznab-name">Name</FieldLabel>
            <Input
              id="torznab-name"
              value={form.name}
              onChange={event => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="torznab-url">Torznab URL</FieldLabel>
            <Input
              id="torznab-url"
              type="url"
              placeholder="http://jackett:9117/api/v2.0/indexers/all/results/torznab/"
              value={form.baseUrl}
              onChange={event => setForm({ ...form, baseUrl: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="torznab-key">API key</FieldLabel>
            <Input
              id="torznab-key"
              type="password"
              autoComplete="off"
              value={form.apiKey}
              onChange={event => setForm({ ...form, apiKey: event.target.value })}
            />
          </Field>
          <ActionRow>
            <Button
              type="submit"
              size="small"
              appearance="settings"
              color="primary"
              disabled={torznab.isLoading || !form.name.trim() || !form.baseUrl.trim()}
            >
              {torznab.isLoading ? 'Adding…' : 'Add endpoint'}
            </Button>
          </ActionRow>
        </Form>
      </Section>
    </>
  );
}
