# Provider fixture workflow

TMDB and Trakt recordings live in `test-fixtures/providers`. The Docker mocks mount
these files directly, so this is the canonical store for provider recordings.

## Replay (default)

The mocks replay existing files and return a 404 for a missing fixture. Tests do
not contact TMDB or Trakt.

```bash
npm run validate:provider-fixtures
npm run test:backend:e2e
```

## Explicit recording

Recording is opt-in for one invocation and may contact the configured provider:

```bash
RECORD_PROVIDER_FIXTURES=true npm run start:backend:e2e
```

For the homepage catalog cross-load lane, run the bounded desktop flow instead:

```bash
npm run test:frontend:e2e:home-catalog
```

This sets `RECORD_PROVIDER_FIXTURES=true`, enables the opt-in Playwright flow,
and runs one Chromium worker so the missing TV and community-list TMDB details
are recorded without multiplying provider traffic across browser projects.

Run only the flow that needs new responses, then stop the environment. Review the
raw diff before asking Codex to fictionalize it. Raw provider content is local
working data until it has been reviewed and transformed; do not commit it.

Each recorded envelope includes an `anonymized` marker. Recording with
`RECORD_PROVIDER_FIXTURES=true` writes `false` because the provider response is
kept original; a normal mock write (when a response is stored) writes `"faker"`.
Reviewed fixtures that were rewritten by Codex/Luna use `"llm"`.

`anonymized: false` is deliberately rejected by fixture validation. Raw recordings
are only intermediate local data and must be fictionalized before the fixture gate
can pass.

To prepare the fields for a Codex/Luna pass, extract them into the mapping JSON,
edit the `replacement` values, then apply that mapping:

```bash
npm run extract:provider-fictionalization
npm run apply:provider-fictionalization
```

The extractor accepts an optional output path if you want a separate work file.
It preserves reviewed replacements, creates deterministic replacements for new
records, and keys TMDB media as `movie:<id>` or `show:<id>` because those ID
namespaces overlap. It also records stable replacements for repeated people,
companies, networks, users, lists, seasons, and episodes. The
committed manifest contains replacements only; raw source text is not retained.

The apply script accepts an optional manifest path. It recursively updates TMDB
and Trakt fixtures, including community-list pages, and reapplies mappings to
previously anonymized fixtures so cross-provider relationships cannot drift.
Protocol configuration, genre taxonomy, dates, numeric IDs, fixture paths, and
image paths are preserved.

## Codex/Luna fictionalization prompt

Use a dedicated Codex task with GPT-6 Luna and ask it to edit the changed JSON
fixtures in one pass across both providers:

> Replace real TMDB and Trakt titles, descriptions, people, companies, networks,
> usernames and user-created list content with believable fictional equivalents.
> Preserve JSON structure, field types, IDs, fixture filenames, ordering,
> pagination, dates, nullability, season/episode numbers and cross-provider
> relationships. Reuse the same fictional value whenever an entity reappears.
> Do not modify OAuth schema or HTTP behavior. Do not add network calls.

After the edit:

```bash
npm run validate:provider-fixtures
git diff --check
```

Then run the relevant unit and E2E tests and commit only the reviewed fictional
fixtures.
