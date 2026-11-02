/** Where Cardigann definitions come from: a folder of `.yml` files in a GitHub repository. */
export interface DefinitionSource {
  /** Stable identity, stored with every definition: `owner/repo@ref:path`, or the index URL. */
  key: string;
  /** Shown to admins. */
  label: string;
  /** Prefix of provider ids installed from this source, e.g. `jackett`. */
  slug: string;
  kind: 'github' | 'index';
  /** github: raw base for single files. index: the folder holding `index.json` and the files. */
  rawBase: string;
  owner?: string;
  repo?: string;
  ref?: string;
  path?: string;
}

/** Definitions installed before sources were configurable came from this repository. */
export const LEGACY_SOURCE_KEY = 'Jackett/Jackett@master:src/Jackett.Common/Definitions';
export const PROWLARR_SOURCE_KEY = 'Prowlarr/Indexers@master:definitions/v11';
export const MIAUFLIX_SOURCE_KEY = 'maury91/miauflix-indexers@main:definitions';
/**
 * Prowlarr's definitions mirror Jackett's, minus the trackers it blocks, and Miauflix's own
 * folder adds what those lack (ID-based search through the sites' JSON APIs). Jackett's folder
 * can be added to the list.
 */
export const DEFAULT_SOURCES =
  'https://github.com/Prowlarr/Indexers/tree/master/definitions/v11 ' +
  'https://github.com/maury91/miauflix-indexers/tree/main/definitions';

const NAME = /^[A-Za-z0-9_.-]+$/;

function github(owner: string, repo: string, ref: string, path: string): DefinitionSource | null {
  const clean = path.replace(/^\/+|\/+$/g, '');
  if (![owner, repo, ref].every(part => NAME.test(part)) || !clean || clean.includes('..'))
    return null;
  return {
    key: `${owner}/${repo}@${ref}:${clean}`,
    label: `${owner}/${repo}`,
    slug: owner.toLowerCase(),
    kind: 'github',
    rawBase: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${clean}`,
    owner,
    repo,
    ref,
    path: clean,
  };
}

/**
 * One entry of the configured list: a GitHub folder URL (`.../tree/<ref>/<path>` or the raw
 * form), or any other http(s) folder that serves an `index.json`. Null when unusable.
 */
export function parseSource(value: string): DefinitionSource | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'github.com' && parts[2] === 'tree' && parts.length > 4)
    return github(parts[0], parts[1], parts[3], parts.slice(4).join('/'));
  if (url.hostname === 'raw.githubusercontent.com' && parts.length > 3) {
    const heads = parts[2] === 'refs' && parts[3] === 'heads';
    const offset = heads ? 4 : 2;
    return parts.length > offset + 1
      ? github(parts[0], parts[1], parts[offset], parts.slice(offset + 1).join('/'))
      : null;
  }
  if (url.hostname === 'github.com' || url.hostname === 'raw.githubusercontent.com') return null;
  url.hash = '';
  url.search = '';
  const base = url.href.replace(/\/$/, '');
  return {
    key: base,
    label: url.hostname,
    slug: url.hostname.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
    kind: 'index',
    rawBase: base,
  };
}

/** The configured list (comma, semicolon or whitespace separated), without duplicates. */
export function parseSources(text: string): { sources: DefinitionSource[]; invalid: string[] } {
  const sources = new Map<string, DefinitionSource>();
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const source = parseSource(token);
    if (source) sources.set(source.key, source);
    else invalid.push(token);
  }
  return { sources: [...sources.values()], invalid };
}
