import { createHash } from 'node:crypto';
import { join } from 'node:path';

import type { Store } from '../../db/store';
import type { HttpClient } from '../../http/http-client';
import { type CardigannDefinition, parseDefinition } from './definition';
import { GitSource, type GitSpec, type GitUrlFor } from './git-source';
import { type DefinitionSource, LEGACY_SOURCE_KEY, PROWLARR_SOURCE_KEY } from './sources';

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_BYTES = 512 * 1024;
const DOWNLOAD_RETRY_MS = 60_000;
/** Listings of hundreds of definitions are larger than any single definition. */
const MAX_INDEX_BYTES = 4 * 1024 * 1024;

export interface DefinitionRow {
  source: string;
  id: string;
  yaml: string;
  sha: string | null;
  fetched_at: number;
}
export type IndexEntry = { id: string; sha: string | null };
export interface DefinitionListing {
  /** Fingerprint of the whole listing (the Git tree sha); equal means nothing changed. */
  sha: string | null;
  entries: IndexEntry[];
}

/** Fetches Jackett definitions at runtime; they are GPL-2.0 so they are never bundled. */
export class DefinitionStore {
  private parsed = new Map<string, { yaml: string; definition: CardigannDefinition | Error }>();
  private gits = new Map<string, GitSource>();
  private failures = new Map<string, { error: Error; until: number }>();
  /** Sources whose working tree holds the current definitions, so reads can skip the network. */
  private gitSpecs = new Map<string, GitSpec>();

  constructor(
    private store: Store,
    private http: HttpClient,
    private configured: () => DefinitionSource[],
    private now: () => number = Date.now,
    private options: { gitDir?: string; gitUrlFor?: GitUrlFor } = {}
  ) {}

  sources(): DefinitionSource[] {
    return this.configured();
  }
  source(key: string): DefinitionSource | undefined {
    return this.configured().find(source => source.key === key);
  }
  /** Source-less rows retain their legacy cache; uncached entries use the default source. */
  sourceKey(id: string, source?: string): string {
    return source ?? (this.row(LEGACY_SOURCE_KEY, id) ? LEGACY_SOURCE_KEY : PROWLARR_SOURCE_KEY);
  }
  private gitFor(source: DefinitionSource): { git: GitSource; spec: GitSpec } | null {
    if (!this.options.gitDir || source.kind !== 'github') return null;
    let git = this.gits.get(source.key);
    if (!git) {
      const folder = createHash('sha1').update(source.key).digest('hex').slice(0, 12);
      git = new GitSource(join(this.options.gitDir, folder));
      this.gits.set(source.key, git);
    }
    const urlFor =
      this.options.gitUrlFor ?? ((owner, repo) => `https://github.com/${owner}/${repo}.git`);
    return {
      git,
      spec: { url: urlFor(source.owner!, source.repo!), ref: source.ref!, path: source.path! },
    };
  }

  row(source: string, id: string): DefinitionRow | undefined {
    return (
      this.store.db
        .query<
          DefinitionRow,
          [string, string]
        >('SELECT * FROM cardigann_definitions WHERE source=? AND id=?')
        .get(source, id) ?? undefined
    );
  }
  /** The parsed definition if it is cached; an Error when it is unsupported or malformed. */
  cached(source: string, id: string): CardigannDefinition | Error | null {
    const row = this.row(source, id);
    if (!row) return null;
    const key = `${source}|${id}`;
    const hit = this.parsed.get(key);
    if (hit?.yaml === row.yaml) return hit.definition;
    let definition: CardigannDefinition | Error;
    try {
      definition = parseDefinition(row.yaml);
    } catch (error) {
      definition = error instanceof Error ? error : new Error('Invalid definition');
    }
    this.parsed.set(key, { yaml: row.yaml, definition });
    return definition;
  }

  private async fetchText(url: string, signal: AbortSignal, maxBytes = MAX_BYTES): Promise<string> {
    const response = await this.http.request(url, {
      signal,
      maxBytes,
      timeoutMs: 15_000,
    });
    if (!response.ok) throw new Error(`Definition source returned HTTP ${response.status}`);
    return response.text();
  }

  /** Definition ids offered by a source (git, else the GitHub trees API or `<base>/index.json`). */
  async list(source: DefinitionSource, signal: AbortSignal): Promise<DefinitionListing> {
    const tidy = (entries: IndexEntry[]) =>
      entries.filter(entry => ID.test(entry.id)).sort((a, b) => a.id.localeCompare(b.id));
    this.gitSpecs.delete(source.key);
    const local = this.gitFor(source);
    if (local) {
      try {
        const listing = await local.git.sync(local.spec, signal);
        this.gitSpecs.set(source.key, local.spec);
        return { sha: listing.sha, entries: tidy(listing.entries) };
      } catch {
        // No git, or it cannot reach the host: the HTTP listing below still works.
        signal.throwIfAborted();
      }
    }
    if (source.kind === 'github') {
      // The trees API is compact and not capped at 1,000 entries like the contents API.
      const text = await this.fetchText(
        `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${source.ref}:${source.path}`,
        signal,
        MAX_INDEX_BYTES
      );
      const listing = JSON.parse(text) as {
        sha?: string;
        tree?: { path: string; sha?: string; type?: string }[];
      };
      return {
        sha: listing.sha ?? null,
        entries: tidy(
          listing.tree
            ?.filter(file => file.type === 'blob' && file.path.endsWith('.yml'))
            .map(file => ({ id: file.path.slice(0, -4), sha: file.sha ?? null })) ?? []
        ),
      };
    }
    const listing = JSON.parse(
      await this.fetchText(`${source.rawBase}/index.json`, signal, MAX_INDEX_BYTES)
    ) as (string | { id: string; sha?: string })[];
    return {
      sha: null,
      entries: tidy(
        listing.map(item =>
          typeof item === 'string'
            ? { id: item, sha: null }
            : { id: item.id, sha: item.sha ?? null }
        )
      ),
    };
  }

  /** Downloads and stores a definition; throws when it cannot be fetched. */
  async download(
    source: DefinitionSource,
    id: string,
    signal: AbortSignal,
    sha: string | null = null
  ): Promise<string> {
    if (!ID.test(id)) throw new Error('Invalid definition id');
    const spec = this.gitSpecs.get(source.key);
    const local = spec ? (this.gitFor(source)?.git.read(spec, id) ?? null) : null;
    const yaml = local ?? (await this.fetchText(`${source.rawBase}/${id}.yml`, signal));
    this.store.db
      .query(
        'INSERT INTO cardigann_definitions (source,id,yaml,sha,fetched_at) VALUES (?,?,?,?,?) ON CONFLICT(source,id) DO UPDATE SET yaml=excluded.yaml,sha=excluded.sha,fetched_at=excluded.fetched_at'
      )
      .run(source.key, id, yaml, sha, this.now());
    this.failures.delete(`${source.key}|${id}`);
    return yaml;
  }

  /** Drops a cached definition of an indexer that no longer exists upstream. */
  forget(source: string, id: string): void {
    this.store.db
      .query('DELETE FROM cardigann_definitions WHERE source=? AND id=?')
      .run(source, id);
    this.parsed.delete(`${source}|${id}`);
    this.failures.delete(`${source}|${id}`);
  }

  /** Makes sure a definition is cached, fetching it when absent. */
  async ensure(
    source: string,
    id: string,
    signal: AbortSignal
  ): Promise<CardigannDefinition | Error> {
    signal.throwIfAborted();
    if (!this.row(source, id)) {
      const spec = this.source(source);
      if (!spec) return new Error('This definition source is no longer configured');
      const key = `${source}|${id}`;
      const failed = this.failures.get(key);
      if (failed && failed.until > this.now()) return failed.error;
      try {
        await this.download(spec, id, signal);
      } catch (error) {
        const failure = error instanceof Error ? error : new Error('Could not fetch definition');
        // A timed-out source should back off too; caller cancellation must not poison retries.
        if (!signal.aborted || signal.reason?.name === 'TimeoutError')
          this.failures.set(key, { error: failure, until: this.now() + DOWNLOAD_RETRY_MS });
        signal.throwIfAborted();
        return failure;
      }
    }
    return this.cached(source, id) ?? new Error('Definition missing');
  }

  /** Definitions installed before sources were configurable belong to the Jackett repository. */
  static readonly LEGACY = LEGACY_SOURCE_KEY;
}
