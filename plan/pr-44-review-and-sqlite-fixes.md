# PR 44 review follow-up

## Baseline

PR 44 commit `25baf6d` addressed the earlier review batch: personal Trakt cache invalidation, SQLite transaction serialization, remote configuration probes and rollback, adjacent list-page requests, and the setup guide. The deleted preloading proposal is no longer an implementation target.

## Five new review findings

1. **Snapshot check mode:** The initial-user E2E script must pass `--update-snapshots=none` in check mode. Update mode keeps its explicit update flag. This prevents missing baselines from being created by Playwright's default `missing` behavior.
2. **SQLite write isolation:** Transactions and direct repository writes share one SQLite connection. Queue direct `save`/`update`/`delete` methods and the repository query-builder write executions in the same database-owned lane as transactions. Operations inside a transaction use its manager and do not re-enter the queue. Prove a staged page and a direct repository save survive an unrelated rollback.
3. **Invalid remote seeds:** Remote registration must handle values rejected by `applyTransform`. Use a valid schema default when available; otherwise use an explicit empty raw value and leave the computed value unset so invalid data cannot enter a remote snapshot. Discovery remains available and reports a warning.
4. **Candidate endpoint probe:** A multi-group save that changes a local service URL and remote provider settings must probe the remote service while the complete candidate configuration is temporarily installed. Restore the old in-memory configuration on every probe exit, before deciding whether to persist or apply.
5. **Current list page data:** `CategoryRow` must render each queried page from RTK Query `currentData`, not retained `data` from another argument. When the selected page has no `currentData`, show its loading or error state; adjacent-page navigation remains available when those pages load.

## Verification and PR follow-up

- Run focused backend configuration and SQLite repository tests, the CategoryRow component test, backend/frontend type checks, lint, and `bash -n` for the snapshot script. Confirm the installed Playwright CLI accepts `--update-snapshots=none`.
- Run the backend suite because the database write lane covers all backend repositories. The automated tests use mocks or fixtures for external APIs.
- After the fixing commit is on the PR branch, reply to the five new inline threads with the commit and relevant proof. Check the remaining outdated preloading threads against the deleted document before closing them.
