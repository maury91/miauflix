import type { ProviderSetting } from '@miauflix/service-contracts';

import { type HttpClient, HttpError } from '../../http/http-client';
import { normalizeHash } from '../../normalize/magnet';
import { resolveHashes } from '../torrent-hash';
import type { Provider, ProviderCaps, ProviderPage, ProviderQuery, RawResult } from '../types';
import { deriveCaps } from './capabilities';
import type { CardigannDefinition, CardigannField } from './definition';
import {
  applyFilter,
  applyFilters,
  type FilterContext,
  parseAnyDate,
  parseSize,
  parseTimeAgo,
} from './filters';
import { type ResponseType, type Row, selectRows } from './selectors';
import { renderTemplate } from './template';

type Settings = Record<string, string | boolean>;
const SETTING_TYPES = new Set(['text', 'password', 'checkbox', 'select']);
const asInteger = (value: string | undefined): number | undefined => {
  const digits = value?.replace(/[^\d]/g, '');
  return digits ? Number(digits) : undefined;
};
const catName = (mapping: { cat?: string }) => mapping.cat ?? '';

export function settingsOf(definition: CardigannDefinition): ProviderSetting[] {
  return (definition.settings ?? [])
    .filter(setting => SETTING_TYPES.has(setting.type))
    .map(setting => ({
      name: setting.name,
      type: setting.type as ProviderSetting['type'],
      label: setting.label ?? setting.name,
      ...(setting.default === undefined
        ? {}
        : {
            default:
              setting.type === 'checkbox'
                ? setting.default === true || setting.default === 'true'
                : String(setting.default),
          }),
      ...(setting.options ? { options: setting.options } : {}),
    }));
}

export class CardigannProvider implements Provider {
  readonly kind = 'cardigann' as const;
  readonly caps: ProviderCaps;
  readonly rate: Provider['rate'];
  readonly requiresFlareSolverr: boolean;
  readonly maxPages: number;
  readonly settingsSchema: ProviderSetting[];
  readonly hosts: string[];
  readonly description?: string;
  private readonly state = { link: 0 };
  private readonly categories: { movie: string[]; tv: string[]; anime: string[] };
  private readonly paged: boolean;
  private readonly mappings: { id: string | number; cat?: string }[];

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly definition: CardigannDefinition,
    private readonly settings: Settings = {},
    private readonly now: () => number = Date.now
  ) {
    const text = JSON.stringify([
      definition.search.path,
      definition.search.paths,
      definition.search.inputs,
    ]);
    this.paged = text.includes('Query.Page');
    this.mappings =
      definition.caps.categorymappings ??
      Object.entries(definition.caps.categories ?? {}).map(([id, cat]) => ({
        id,
        cat: String(cat),
      }));
    const derived = deriveCaps(
      {
        ...definition.caps,
        categories: Object.fromEntries(
          Object.entries(definition.caps.categories ?? {}).map(([id, cat]) => [id, String(cat)])
        ),
      },
      this.paged
    );
    this.categories = derived.categories;
    this.caps = derived.caps;
    this.rate = {
      perMinute: 30,
      minIntervalMs: Math.max(500, Math.round((definition.requestDelay ?? 1) * 1000)),
      dailyBudget: null,
    };
    this.requiresFlareSolverr = (definition.settings ?? []).some(
      s => s.type === 'info_flaresolverr'
    );
    this.maxPages = this.paged ? 3 : 1;
    this.settingsSchema = settingsOf(definition);
    this.description = definition.description;
    this.hosts = [...definition.links, ...(definition.legacylinks ?? [])].flatMap(link => {
      try {
        return [new URL(link).host];
      } catch {
        return [];
      }
    });
  }

  private config(): Settings {
    return Object.fromEntries(
      settingsOf(this.definition).flatMap(setting => {
        const value = this.settings[setting.name] ?? setting.default;
        return value === undefined ? [] : [[setting.name, value]];
      })
    );
  }
  private context(query: ProviderQuery): Record<string, unknown> {
    const keywords = query.q ?? '';
    const imdb = query.imdbid ?? '';
    return {
      Keywords: keywords,
      Query: {
        Keywords: keywords,
        IMDBID: imdb ? `tt${imdb.replace(/^tt/, '')}` : '',
        IMDBIDShort: imdb.replace(/^tt/, ''),
        TMDBID: query.tmdbid ?? '',
        TVDBID: query.tvdbid ?? '',
        Season: query.season ?? '',
        Ep: query.ep ?? '',
        AniDBAID: query.anidbAid ?? '',
        AniDBEID: query.anidbEid ?? '',
        AniListID: query.anilistId ?? '',
        Type: query.kind === 'movie' ? 'movie' : query.kind === 'tv' ? 'tvsearch' : 'search',
        Page: query.page ?? 1,
      },
      Categories: this.categories[query.kind],
      Config: this.config(),
      Result: {},
      Today: { Year: new Date(this.now()).getUTCFullYear() },
      True: 'True',
      False: null,
    };
  }
  private filterContext(keywords: string): FilterContext {
    return { now: this.now, keywords };
  }
  private applicable(path: { categories?: (string | number)[] }, kind: ProviderQuery['kind']) {
    if (!path.categories?.length) return true;
    const mine = this.categories[kind];
    return path.categories.some(category => {
      const value = String(category);
      return (
        mine.includes(value) ||
        mine.some(id =>
          this.mappings.some(m => String(m.id) === id && catName(m).startsWith(value))
        )
      );
    });
  }
  private links(): string[] {
    return [...this.definition.links, ...(this.definition.legacylinks ?? [])];
  }

  private evaluate(
    row: Row,
    spec: CardigannField | string,
    context: Record<string, unknown>,
    fctx: FilterContext
  ): string | null {
    const field: CardigannField = typeof spec === 'string' ? { text: spec } : spec;
    const render = (value: string) => renderTemplate(value, context);
    let value: string | null;
    if (field.remove) row.strip(field.remove);
    if (field.text !== undefined) value = render(String(field.text));
    else if (field.case) {
      const entries = Object.entries(field.case);
      const hit = entries.find(([selector]) => selector !== '*' && row.matches(selector));
      const fallback = entries.find(([selector]) => selector === '*');
      const chosen = hit ?? fallback;
      value = chosen ? render(String(chosen[1])) : null;
    } else value = row.read(field.selector ? render(field.selector) : undefined, field.attribute);
    if (value === null || value === '') {
      if (field.default !== undefined) value = render(String(field.default));
      else if (value === null) return field.optional ? '' : null;
    }
    return applyFilters(value, field.filters, fctx, render);
  }

  private extract(
    type: ResponseType,
    body: string,
    base: string,
    context: Record<string, unknown>,
    keywords: string
  ): RawResult[] {
    const spec = this.definition.search;
    const fctx = this.filterContext(keywords);
    const rows = selectRows(type, body, spec.rows);
    const results: RawResult[] = [];
    for (const row of rows) {
      if (spec.rows.remove) row.strip(spec.rows.remove);
      const result: Record<string, string> = {};
      const rowContext = { ...context, Result: result };
      let skip = false;
      for (const [name, field] of Object.entries(spec.fields)) {
        const value = this.evaluate(row, field, rowContext, fctx);
        if (value === null) {
          if (name === 'title') skip = true;
          continue;
        }
        result[name] = value;
      }
      if (skip || !result.title) continue;
      // `andmatch` as a row filter keeps only rows whose title contains every search keyword.
      if (
        spec.rows.filters?.some(
          filter => filter.name === 'andmatch' && applyFilter(result.title, filter, fctx) === ''
        )
      )
        continue;
      const absolute = (link?: string) => {
        if (!link) return undefined;
        if (link.startsWith('magnet:')) return link;
        try {
          return new URL(link, base).href;
        } catch {
          return undefined;
        }
      };
      const download = absolute(result.download);
      const magnet = result.magnet?.startsWith('magnet:')
        ? result.magnet
        : download?.startsWith('magnet:')
          ? download
          : undefined;
      const seeders = asInteger(result.seeders);
      const peers = asInteger(result.peers);
      const date = result.date
        ? (parseAnyDate(result.date) ?? parseTimeAgo(result.date, this.now()))
        : null;
      results.push({
        title: result.title,
        hash: normalizeHash(result.infohash ?? '') ?? undefined,
        magnet,
        torrentUrl: download && !download.startsWith('magnet:') ? download : undefined,
        detailsUrl: absolute(result.details),
        size: result.size ? (parseSize(result.size) ?? undefined) : undefined,
        seeders,
        leechers:
          asInteger(result.leechers) ??
          (peers !== undefined && seeders !== undefined ? Math.max(0, peers - seeders) : undefined),
        date: date?.toISOString(),
        imdbid: (result.imdbid ?? result.imdb)?.match(/tt\d+/)?.[0],
        category: result.category ? this.categoryName(result.category) : undefined,
        // Miauflix extension: a curated pick (SeaDex) as `best` or `alt`.
        release: result.release === 'best' || result.release === 'alt' ? result.release : undefined,
      });
    }
    return results;
  }
  private categoryName(id: string): string | undefined {
    return this.mappings.find(m => String(m.id) === id)?.cat;
  }

  private async request(
    ctx: { signal: AbortSignal; http: HttpClient },
    pathTemplate: string,
    method: string,
    inputs: Record<string, string>,
    headers: Record<string, string>,
    ctxTemplate: Record<string, unknown>
  ): Promise<{ body: string; base: string }> {
    const links = this.links();
    let error: unknown;
    for (let i = 0; i < links.length; i++) {
      const index = (this.state.link + i) % links.length;
      const base = links[index].endsWith('/') ? links[index] : `${links[index]}/`;
      try {
        const rendered = renderTemplate(pathTemplate, ctxTemplate);
        const url = new URL(rendered.replace(/^\//, ''), base);
        const raw = inputs.$raw;
        const params = new URLSearchParams(
          Object.entries(inputs).filter(([key]) => key !== '$raw')
        );
        let body: string | undefined;
        const init: Record<string, unknown> = { signal: ctx.signal, headers: { ...headers } };
        if (method === 'post') {
          body = [params.toString(), raw].filter(Boolean).join('&');
          init.method = 'POST';
          init.body = body;
          (init.headers as Record<string, string>)['content-type'] =
            'application/x-www-form-urlencoded';
        } else {
          const query = [params.toString(), raw].filter(Boolean).join('&');
          if (query) url.search = [url.search.replace(/^\?/, ''), query].filter(Boolean).join('&');
        }
        const response = await ctx.http.request(url.href, {
          ...init,
          requiresFlareSolverr: this.requiresFlareSolverr,
        });
        // HttpError carries Retry-After, so a rate-limited site pauses the provider properly.
        if (!response.ok) throw new HttpError(response.status, response.headers.get('retry-after'));
        this.state.link = index;
        return { body: await response.text(), base: url.href };
      } catch (caught) {
        ctx.signal.throwIfAborted();
        error = caught;
      }
    }
    throw error ?? new Error('No provider links');
  }

  async search(
    query: ProviderQuery,
    ctx: { signal: AbortSignal; http: HttpClient }
  ): Promise<ProviderPage> {
    const spec = this.definition.search;
    const context = this.context(query);
    const fctx = this.filterContext(query.q ?? '');
    const keywords = applyFilters(query.q ?? '', spec.keywordsfilters, fctx);
    context.Keywords = keywords;
    const paths = spec.paths?.length ? spec.paths : [{ path: spec.path }];
    const render = (value: unknown) => renderTemplate(String(value), context);
    const results: RawResult[] = [];
    let base = this.links()[0];
    for (const path of paths) {
      if (!this.applicable(path as { categories?: (string | number)[] }, query.kind)) continue;
      const entry = path as {
        path?: string;
        method?: string;
        inputs?: Record<string, unknown>;
        inheritinputs?: boolean;
        response?: { type?: ResponseType };
      };
      const inputs: Record<string, string> = {};
      for (const [key, value] of Object.entries({
        ...(entry.inheritinputs === false ? {} : spec.inputs),
        ...entry.inputs,
      }))
        inputs[key] = render(value);
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(spec.headers ?? {}))
        headers[key] = render(Array.isArray(value) ? value[0] : value);
      const response = await this.request(
        ctx,
        entry.path ?? spec.path ?? '/',
        (entry.method ?? spec.method ?? 'get').toLowerCase(),
        inputs,
        headers,
        context
      );
      base = response.base;
      results.push(
        ...this.extract(entry.response?.type ?? 'html', response.body, base, context, keywords)
      );
    }
    const seen = new Set<string>();
    const unique = results.filter(r => {
      const key = r.hash ?? r.magnet ?? r.torrentUrl ?? r.detailsUrl ?? r.title;
      return seen.has(key) ? false : (seen.add(key), true);
    });
    const resolved = await resolveHashes(unique, { ...ctx, hosts: this.hosts }, result =>
      this.resolveDownload(result, ctx)
    );
    return {
      results: resolved,
      hasMore: this.paged && unique.length > 0 && (query.page ?? 1) < this.maxPages,
    };
  }

  /** Reads a magnet or .torrent link from a result's details page (`download.selectors`). */
  private async resolveDownload(
    result: RawResult,
    ctx: { signal: AbortSignal; http: HttpClient }
  ): Promise<void> {
    const selectors = this.definition.download?.selectors;
    if (!result.detailsUrl || !selectors?.length) return;
    const response = await ctx.http.request(result.detailsUrl, {
      signal: ctx.signal,
      blockInternal: true,
      allowHosts: this.hosts,
      requiresFlareSolverr: this.requiresFlareSolverr,
    });
    if (!response.ok) return;
    const [row] = selectRows('html', await response.text(), { selector: 'html' });
    if (!row) return;
    const context = { Config: this.config(), Result: {}, Keywords: '' };
    for (const selector of selectors) {
      const value = row.read(selector.selector, selector.attribute);
      if (!value) continue;
      const link = applyFilters(value, selector.filters, this.filterContext(''), arg =>
        renderTemplate(arg, context)
      );
      if (link.startsWith('magnet:')) result.magnet = link;
      else {
        try {
          result.torrentUrl = new URL(link, result.detailsUrl).href;
        } catch {
          continue;
        }
      }
      return;
    }
  }

  async test(ctx: { signal: AbortSignal; http: HttpClient }) {
    const kind = this.caps.movie.length ? 'movie' : this.caps.tv.length ? 'tv' : null;
    if (!kind) return { success: false, message: 'This definition does not support movies or TV' };
    try {
      const page = await this.search({ kind, q: 'test' }, ctx);
      return {
        success: true,
        message: `Reachable; ${page.results.length} results for a sample search`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message.slice(0, 300) : 'Test failed',
      };
    }
  }
}
