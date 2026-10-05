# PR #48: CI diagnosis and review fix plan

Investigated 2026-10-05 using the GitHub plugin against head `1dad88e8b33bc26b264c3d1bb70370894ebaa9d9`. The local checkout matched that head during diagnosis. The implementation described below is now applied in the working tree, and this file remains a traceable record of the diagnosis, decisions, and acceptance evidence.

PR: https://github.com/maury91/miauflix/pull/48

Run: https://github.com/maury91/miauflix/actions/runs/37339694992

## Confirmed CI failures

The `test` job passed build, TypeScript, lint, formatting, and unit tests. The main E2E lane passed (backend: 87 tests; browser: 34 tests plus 3 additional tests). Initial-user setup also passed. Two later lanes failed:

| Lane                        | Evidence                                                                                                                 | Root cause                                                                                                                                                                               | Planned change                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline details preparation | Job `111865374902`: all three attempts throw `Unexpected offline E2E request: POST /api/media/backdrop-focus/background` | `CategoryRow` now sends the background queue request, but `frontend/e2e/details-preparation.e2e.spec.ts` does not intercept it                                                           | Add an explicit POST handler returning the actual response contract (`accepted` count), validate the submitted fixture items, and retain the catch-all rejection for unexpected requests |
| Home Storybook visuals      | Job `111865374966`: five home tests fail on all attempts; five other visual tests pass                                   | Uploaded `error-context.md` says the mocked media API does not export `useQueueBackdropFocusMutation`. The manual mock lacks it, so the stories fail to import before artwork can render | Extend `frontend/src/features/media/api/__mocks__/media.api.ts` with the missing hook and a stable mutation trigger returning an `unwrap()` promise with the background response shape   |

The visual timeout is a secondary symptom of a Storybook import error. Do not increase timeouts, relax image assertions, or regenerate snapshots to conceal it. Review any real snapshot differences only after stories render.

Visual evidence artifact: https://github.com/maury91/miauflix/actions/runs/37339694992/artifacts/11358362333

The offline details voting step was skipped after details preparation failed; its current result is unverified.

## CodeRabbit triage

GitHub reports 23 review threads: 17 resolved and 6 unresolved. The latest review contains seven actionable findings in those six threads (one thread contains two findings), plus four nitpicks. Findings were checked against the current code rather than accepted from their suggested patches.

| Finding                                           | Verdict                                                  | Evidence and planned handling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New speculative download competes with playback   | Confirmed                                                | `predownloadSource` unconditionally selects the video after awaiting admission; the pause sweep only runs at the first stream. Enforce playback priority whenever speculative selection is admitted, including warmup. Preserve watched/actively streamed sources. [Thread](https://github.com/maury91/miauflix/pull/48#discussion_r4186310461)                                                                                                                                                              |
| Stream admission leaks if the pause sweep rejects | Confirmed                                                | `streamFile` increments memory counts and storage playback count before the sweep, while release is created afterward. Roll back exactly the admitted reference on failure under the source lock; preserve concurrent streams and restore speculative work if rollback ends playback. Same thread as above.                                                                                                                                                                                                  |
| Warmup range is not paused/restored               | Confirmed                                                | `warmSource` selects an explicit piece range; `pauseDownload` only deselects files; `resumeDownload` selects every file. Retain selection intent per source, clear explicit piece selections on pause, and restore the intended range on resume. Promotion must replace warmup intent with full-video intent; cleanup must discard stale intent. [Thread](https://github.com/maury91/miauflix/pull/48#discussion_r4186310469)                                                                                |
| Startup logs are lost                             | Confirmed; qualify suggested fix                         | `env.sh` starts log following only after `up --wait`, with `--since 1m` despite a 120-second startup wait. Capture complete logs on startup failure and follow complete current-container history after success. Starting a follower before containers exist can exit immediately, so do not apply that suggestion blindly. [Thread](https://github.com/maury91/miauflix/pull/48#discussion_r4186310456)                                                                                                     |
| Backdrop requests resend previous pages           | Confirmed                                                | `CategoryRow` posts the first 50 eligible loaded items whenever its page map changes. Track successful/in-flight keys per row, submit only new items, and allow a later legitimate retry after rejection without creating a retry loop. Retain visibility, eligibility, and batch limits. [Thread](https://github.com/maury91/miauflix/pull/48#discussion_r4186310482)                                                                                                                                       |
| Watchlist enqueue can throw synchronously         | Not a production bug in the current implementation       | `BackgroundJobService.enqueue` is declared `async`; internal synchronous failures become rejected promises and the existing catch handles them. Do not add a duplicate guard solely for a mock violating that contract. Preserve and verify immediate-sync fallback on queue rejection. [Thread](https://github.com/maury91/miauflix/pull/48#discussion_r4186310474)                                                                                                                                         |
| Remote concurrency of 100 reaches runtime         | Not reachable through the current configuration boundary | `CatalogConfigService` inherits `ServiceConfiguration.applyRemote`, whose probe validates finite integer numbers against schema bounds before activation. `BACKDROP_FOCUS_CONCURRENCY` is constrained to 1–8. Add a focused boundary regression for 100 with zero provider/activation calls; no duplicate runtime clamp is required for this finding. Direct construction of `BackdropFocusService` is a separate internal API. [Thread](https://github.com/maury91/miauflix/pull/48#discussion_r4186310510) |
| Empty intermediate Trakt page ends pagination     | Confirmed edge case                                      | `nextEpisodes` stops on empty items even if `totalPages` advertises later pages. Remove that additional stop condition and test empty middle and zero-page cases.                                                                                                                                                                                                                                                                                                                                            |
| Background sweep loads all catalog candidates     | Confirmed scaling issue; lower priority                  | Each interval loads both complete candidate sets, then cache/retry lookups occur per attempted row. Bound candidate retrieval and skip retrieval when database work is pending; keep provider/image-key/algorithm checks in the existing service because provider keys are not guaranteed to equal stored backdrop URLs.                                                                                                                                                                                     |
| Cache-hit output is always false                  | Overstated; documentation improvement only               | It means an exact match, not any restored cache. Same-SHA reruns can match; new commits normally restore a prefix. Clarify the output description or rename it to indicate an exact match.                                                                                                                                                                                                                                                                                                                   |
| Remove SHA from the cache key                     | Do not apply                                             | This would reuse one immutable cache for unchanged lockfile/config inputs and stop persisting newer Turbo results. Unique keys plus restore prefixes are the documented update strategy. Cache churn is a possible cost, not either observed failure.                                                                                                                                                                                                                                                        |

Nitpicks: https://github.com/maury91/miauflix/pull/48#pullrequestreview-5417658362

Cache behavior verified with Context7 against the official action documentation: https://github.com/actions/cache/blob/main/tips-and-workarounds.md#update-a-cache and https://github.com/actions/cache/blob/main/restore/README.md.

## Implementation order and acceptance

1. **Restore the two failing CI contracts.** Extend the Storybook manual mock and the offline details API harness. Run details preparation, details voting, and all existing visual tests. Keep provider and torrent traffic mocked; make no fixture recordings. Existing screenshot baselines should be evaluated unchanged first.
2. **Fix download lifecycle as one coherent change.** Own stream counts, playback pause/resume, and source selection intent in `DownloadService`. Trace interleavings around awaited torrent/storage operations so a new speculative source cannot escape the pause sweep and a stale resume cannot reselect it during renewed playback. Reuse existing locks without nesting the same source lock. Keep unrelated manual pauses untouched. Restore work only after the final active stream exits.
3. **Fix backdrop request duplication and startup diagnostics.** Add row-level request tests with actual backdrop-bearing fixtures. Verify startup failures still produce complete logs and successful startup leaves a live follower that cleanup terminates.
4. **Fix Trakt pagination and bound the database sweep.** Keep provider validation and termination guarantees. Test candidate eligibility, cache version changes, retry expiry, queue backpressure, and immediate/displayed priority using temporary databases and mocked image fetches.
5. **Prove the disputed findings at their existing boundaries.** Verify queue rejection invokes fallback without rejecting a saved local watchlist operation. Add concurrency-boundary validation coverage. Clarify cache output semantics while preserving restore/save key alignment.

Download regressions must cover admission during playback, admission racing the final release, warmup piece deselection/restoration, watched promotion, pause-sweep failure rollback, multiple concurrent streams on the same source, cancellation/EOF release exactly once, and unrelated manual pauses. Use isolated mocks and existing fixtures; no real torrents/providers.

Run commands from the repository root. Focused browser gates:

```sh
npm run test:e2e:details --workspace frontend
npm run test:e2e:details-voting --workspace frontend
npm run test:frontend:visual
```

Run the affected existing backend/frontend/service unit suites after each implementation group. Final gates: `npm run check:ts`, `npm run lint`, `npm run format:check`, and the changed workspace builds. Then verify a new GitHub run on the updated PR head, including the previously skipped voting step and the main E2E/initial-setup lanes.

No review replies or resolutions were posted, and no workflow rerun, commit, or push was performed.

## Implementation evidence

Applied changes cover the two failing CI contracts, playback-safe speculative admission and warmup selection restoration, startup log capture, watchlist enqueue fallback, CategoryRow queue deduplication, Trakt pagination, and bounded catalog backdrop scans. The cache-key removal suggestion was intentionally not applied.

Passing checks:

- `npm run check:ts`
- `npm run lint` (existing warnings only)
- `npm run format:check`
- backend download and list service tests (26 passed)
- frontend unit suite (210 passed)
- focused details Playwright test (1 passed after regenerating its stale loaded-backdrop baseline)
- full Storybook visual lane (10 passed)
- Trakt, backdrop-focus, and catalog configuration service tests (24 passed)
