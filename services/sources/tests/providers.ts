import type { Database } from 'bun:sqlite';

// Hosts without a dot are treated as internal, so the tests are not slowed by request spacing.
/** A definition source nobody configures: test definitions are cached straight into the database. */
export const TEST_SOURCE = 'tests.invalid/definitions';

const header = (id: string, host: string) => `---
id: ${id}
name: ${id}
type: public
language: en-US
links:
  - https://${host}/
`;

/** Searches by IMDb id, or by title (paged), over one JSON list shaped as `{ results: [...] }`. */
export const idTitle = (id: string, host: string) => `${header(id, host)}
caps:
  categorymappings:
    - {id: Movies, cat: Movies, desc: Movies}
    - {id: TV, cat: TV, desc: TV}
  modes:
    search: [q]
    tv-search: [q, season, ep, imdbid]
    movie-search: [q, imdbid]
search:
  paths:
    - path: "{{ if .Query.IMDBID }}by-imdb/{{ .Query.IMDBID }}{{ else }}search/{{ .Keywords }}{{ end }}"
      response:
        type: json
  inputs:
    page: "{{ .Query.Page }}"
  rows:
    selector: results
  fields:
    title:
      selector: n
    infohash:
      selector: h
    seeders:
      selector: se
    size:
      selector: s
    imdbid:
      selector: i
`;

/** A TV API that only lists one show's episodes by IMDb id (no text search). */
export const tvApi = (id: string, host: string) => `${header(id, host)}
caps:
  categorymappings:
    - {id: TV, cat: TV, desc: TV}
  modes:
    tv-search: [imdbid]
search:
  paths:
    - path: api/list
      response:
        type: json
  inputs:
    imdb_id: "{{ .Query.IMDBIDShort }}"
  rows:
    selector: torrents
  fields:
    title:
      selector: title
    infohash:
      selector: hash
    seeders:
      selector: seeds
    size:
      selector: size_bytes
    date:
      selector: date_released_unix
`;

/** A movie API whose movies hold their torrents, searched by IMDb id or title. */
export const movieApi = (id: string, host: string) => `${header(id, host)}
caps:
  categorymappings:
    - {id: Movies, cat: Movies, desc: Movies}
  modes:
    search: [q]
    movie-search: [q, imdbid]
search:
  paths:
    - path: api/movies
      response:
        type: json
  inputs:
    query_term: "{{ if .Query.IMDBID }}{{ .Query.IMDBID }}{{ else }}{{ .Keywords }}{{ end }}"
  rows:
    selector: data.movies
    attribute: torrents
    multiple: true
  fields:
    title:
      selector: ..title_long
    infohash:
      selector: hash
    seeders:
      selector: seeds
    imdbid:
      selector: ..imdb_code
`;

/** Turns off every built-in provider and adds the given definitions as enabled providers. */
export function useProviders(
  db: Database,
  providers: { id: string; yaml: string; priority: number; enabled?: boolean }[]
): void {
  db.run('UPDATE providers SET enabled=0');
  for (const provider of providers) {
    db.query(
      'INSERT INTO cardigann_definitions (source,id,yaml,sha,fetched_at) VALUES (?,?,?,NULL,0)'
    ).run(TEST_SOURCE, provider.id, provider.yaml);
    db.query(
      "INSERT INTO providers (id,kind,repository_id,name,definition,enabled,priority) VALUES (?,'cardigann','builtin:miauflix',?,?,?,?)"
    ).run(
      `test-${provider.id}`,
      provider.id,
      JSON.stringify({ cardigann: provider.id, source: TEST_SOURCE }),
      provider.enabled === false ? 0 : 1,
      provider.priority
    );
  }
}
