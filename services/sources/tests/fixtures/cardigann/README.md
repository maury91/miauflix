# Cardigann fixtures

Hand-written definitions that follow the structure of the public Jackett/Cardigann YAML format
(see https://wiki.servarr.com/en/prowlarr/cardigann-yml-definition). They are **not** copies of any
Jackett definition: Jackett's definitions are GPL-2.0 and are fetched at runtime, never vendored.
Hosts use the reserved `.invalid` TLD; all data is invented.

- `json-api.yml`: a JSON API with templated paths and ids, shaped like the therarbg definition.
- `nested-json.yml`: nested rows (`attribute` + `multiple`) with `..` parent access, shaped like yts.
- `html-table.yml`: an HTML table with a magnet link per row, shaped like eztv/nyaasi.
- `html-details.yml`: rows with only a details page; the download link comes from `download.selectors`.
- `private-tracker.yml`, `unsupported-filter.yml`: definitions that must be flagged unsupported.
