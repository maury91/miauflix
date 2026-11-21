# Maintainability and performance standards

Status: proposal (2026-11-21). These are the standards code in Miauflix is written to: easy for a
person to read, fast to run. They describe the target, not the code as it is; existing code that
falls short is debt, tracked in [Current debt](#current-debt) and paid down when it is touched. They
build on [coding conventions](coding-conventions.md) and [CSS architecture](css-architecture.md).

Each rule says how it is enforced. A rule enforced only by review is a rule that erodes, so most
of these are meant to end up in `eslint.config.mjs` or CI (see [Enforcement](#enforcement)).

## 1. Size limits

Small units are the single biggest factor in whether a reader can hold code in their head. The
limits count lines of code without blank lines and comments.

| Unit                                  | Target | Hard limit | Enforced by                                       |
| ------------------------------------- | ------ | ---------- | ------------------------------------------------- |
| File (service, module, util)          | ≤ 250  | 400        | `max-lines`                                       |
| React component file                  | ≤ 200  | 300        | `max-lines` (`*.tsx` override)                    |
| Test file                             | ≤ 400  | 600        | `max-lines` (test override)                       |
| Function / method / component body    | ≤ 40   | 80         | `max-lines-per-function`                          |
| Cyclomatic complexity per function    | ≤ 10   | 15         | `complexity`                                      |
| Nesting depth                         | ≤ 2    | 3          | `max-depth`                                       |
| Positional parameters                 | ≤ 3    | 4          | `max-params`; beyond that, pass an options object |
| Constructor dependencies of a service | ≤ 6    | 8          | Review; more means the service does too much      |

Generated files, type declarations for third-party libraries (`*.d.ts`) and database migrations are
exempt.

**When a file hits the limit, split it by concept, never by kind.** Name the pieces first: if
you can't, the file isn't ready to split. A 1000-line playback service is a session lifecycle, a
health sampler and a hedging policy; it is not a `helpers.ts`, a `types.ts` and a `constants.ts`.
The original module keeps its public surface (an `index.ts` or the same exports), so callers don't
change.

## 2. Readability

1. **One reason to change per module.** If two unrelated feature requests would both edit a file,
   it holds two modules.
2. **Pure core, thin shell.** Decisions live in pure functions: inputs in, result out, no I/O, no
   clock, no randomness. Services read state, call the pure function and apply the result. Time and
   randomness are parameters (`now: number`, `random: () => number`). Pure functions are the parts
   that can be read, tested and reused without setup.
3. **Read top to bottom.** Public API first, then the helpers it uses, in the order it uses them.
   Early returns instead of nested `if`s. No `else` after `return`.
4. **Names say what; comments say why.** No comment that restates code. Comments record what code
   can't: a measurement, a browser or protocol quirk, a rejected alternative, a unit. Units go in
   names (`_MS`, `Bytes`, `Fraction`, `Px`). Booleans read as questions (`isReady`, `hasSource`).
   No abbreviations other than the established ones (`id`, `url`, `tmdb`).
5. **No magic values.** Every number or string with meaning is a named constant with a comment on
   where it comes from.
6. **Make illegal states unrepresentable.** A discriminated union
   (`{ status: 'ready'; url } | { status: 'failed'; error }`) instead of optional fields that are
   only valid together. `switch` over the discriminant, closed with an exhaustive `never` check.
7. **Parse at the edge, trust inside.** External data (HTTP, files, other services, the database's
   JSON columns) is validated once with zod where it enters and is typed from then on.
8. **No dead code.** No commented-out code, no unused exports, files or dependencies. Git keeps
   history.
9. **Abstract on the third use.** Duplicate once; extract when the third copy shows what is
   actually shared. No generic base classes or wrappers for a single caller.

## 3. Structure and boundaries

- **Every module has a public surface.** A feature or service folder exports what others may use
  from its `index.ts`; nothing imports its internal files from outside.
- **Dependencies point one way:** types → pure logic → stateful services → transport (routes,
  gateways, components). Nothing below imports from above.
- **Frontend layering:** `shared/` imports nothing from `features/`, `pages/` or `app/`;
  `features/` don't import from `pages/` or `app/`; features import each other only through
  `index.ts`.
- **Services communicate only through `@miauflix/service-contracts`.** No service imports another's
  source. Breaking changes bump the contract version
  ([service contract v2](../architecture/service-contract-v2.md)).
- **A new boundary comes with its lint rule.** Architecture lives in `eslint.config.mjs`, not in
  people's memory.

## 4. Types

- `strict`, plus `noUncheckedIndexedAccess` (array and record lookups may be `undefined`) and
  `noImplicitOverride`. `exactOptionalPropertyTypes` in the contract packages, where missing and
  `undefined` differ on the wire.
- No `any`. Use `unknown` and narrow. A third-party gap is typed in a `.d.ts`, not cast at the call
  site.
- No non-null assertions (`!`) outside tests; narrow or throw a typed error.
- `satisfies` for configuration and lookup tables, so they keep literal types.
- Branded types for identifiers that can be confused (`SourceId`, `MediaId`, `TmdbId`).
- Exported functions declare their return type; it is the contract a reader checks first.

## 5. Errors, async and resources

- **Only typed errors.** Every thrown error is an `AppError` subclass with `type` and `code`,
  including in utilities and parsers. Wrapped errors pass the original as `cause`.
- **No silent catch.** A `catch` either handles the error (with a comment saying why that is
  correct), converts it to a typed error, or logs and rethrows.
- **Every promise is awaited, returned, or detached with `void`.** A detached task catches and logs
  its own errors. Enforced by `no-floating-promises` and `no-misused-promises`.
- **Cancellation flows down.** Operations that can outlive their caller accept an `AbortSignal`
  and pass it on to `fetch` and to child operations.
- **Every resource has an owner that releases it.** Timers, intervals, listeners, subscriptions,
  streams and file handles are released on unmount or shutdown. Prefer `using` /
  `Symbol.dispose` where the lifetime is a scope. Backend timers that shouldn't keep the process
  alive are `unref()`ed.
- **Every cache and queue is bounded** by size and/or TTL, with a comment saying what it saves.
- **Every outgoing call has a timeout.**

## 6. React

1. **Components render; hooks behave.** A component's body is mostly JSX. Data loading, navigation
   registration, timers and subscriptions live in named hooks (`useDetailsData`,
   `useDetailsNavigation`). A page reads as an outline of its regions.
2. **Effects only synchronise with the outside world** (DOM, timers, sockets, the TV player).
   Derived values are computed during render; reactions to user actions go in event handlers; server
   data goes through RTK Query. A value an effect must read without re-running goes through
   `useEffectEvent`.
3. **No `eslint-disable` for hook rules.** A suppression means the effect is shaped wrong.
4. **The React Compiler handles memoisation.** No `useMemo`, `useCallback` or `memo` by default;
   add one only with a measured reason in a comment.
5. **State lives in the narrowest place that works:** local → lifted → context (for values that
   rarely change) → Redux (shared, long-lived client state) → RTK Query (server state). Server data
   is never copied into slices. Selectors return the smallest value; derived objects and arrays go
   through `createSelector`.
6. **Props:** at most about 7; more means the component should be split or take a child. No
   boolean props that switch between two layouts; that is two components.
7. **No `console.*`.** Use the shared logger, which is silent in production builds unless enabled.

## 7. Frontend and TV performance

The TV (Tizen 5.5, Chromium 69, software rasterisation) is the reference device. Code that is fast
there is fast everywhere.

- **Measure before and after**, on the TV, with the numbers recorded in
  [tv-benchmarks](tv-benchmarks.md). An optimisation without a measurement is not merged; a
  measurement that no longer holds is removed with its optimisation.
- **Startup JavaScript is budgeted.** The TV bundle has a size limit checked in CI. Pages not needed
  at startup (settings, setup, player, profile editor) are lazy-loaded.
- **No CSS created after startup**, and fixed values in paint properties
  ([CSS architecture](css-architecture.md)).
- **Animate only `transform` and `opacity`.**
- **No layout thrashing:** read all geometry, then write; never interleave
  `getBoundingClientRect` with style changes.
- **Render what is visible.** Long rows and lists render only the cards in and near the viewport.
- **Images at display size**, `decoding="async"`, lazy below the fold; only the hero is preloaded.
- **Throttle per-event work** (keys, scroll, resize, focus) to animation frames.

## 8. Backend and services performance

- **No N+1 queries.** Load relations with joins or batch by id; select only the columns used.
- **Every frequent `WHERE`/`ORDER BY` column is indexed**, through a migration.
- **SQLite:** WAL mode, a `busy_timeout`, many writes grouped in one short transaction, no network
  I/O inside a write transaction, `PRAGMA optimize` on a schedule.
- **Nothing blocks the event loop on a request path.** No synchronous `fs` outside startup;
  CPU-heavy work (parsing large files, image processing, hashing) goes to a worker or its own
  service.
- **Stream, don't buffer.** Media and large responses are piped with backpressure respected.
- **Outgoing calls are rate-limited and bounded in concurrency** (the request budgets and
  `dynamic-rate-limit`), with timeouts.
- **Caching happens at service boundaries**, in one place per kind of data, with a bound and TTL.
- **New external calls and slow paths get a tracing span** ([tracing](tracing.md)).

## 9. Tests

- Tests exercise public behaviour, so a refactor that keeps behaviour keeps tests green.
- Pure logic: table-driven unit tests. Services: tests with fakes for their dependencies. Flows: e2e
  with recorded fixtures.
- Every bug fix comes with the test that would have caught it.
- Deterministic: time and randomness are injected, never `sleep` to wait for async work.
- Splitting a file that has no tests starts with characterisation tests of its current behaviour.
- Test files follow the size limits too; a long test file mirrors a module that does too much.

## Enforcement

Rules to add to `eslint.config.mjs` and CI, in order:

| #   | Rule                                                                                                                                                                                   | Notes                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | `max-lines` (400 / 300 for `*.tsx` / 600 for tests), `max-lines-per-function` (80), `complexity` (15), `max-depth` (3), `max-params` (4), all with `skipBlankLines` and `skipComments` | Errors for new code; existing offenders listed in a baseline (see below) |
| 2   | Full `eslint-plugin-react-hooks` recommended preset (v7, installed), and no `eslint-disable` for its rules                                                                             | Compiler-backed rules: purity, refs, setState in effects                 |
| 3   | `no-console` in `frontend/src`, with a shared logger                                                                                                                                   | Matches the backend rule                                                 |
| 4   | Frontend import boundaries with `no-restricted-imports`                                                                                                                                | `shared/` → nothing above it; features only via `index.ts`               |
| 5   | `no-restricted-syntax` against `new Error(` and `throw` of non-`AppError` in `backend/src` and `services/*/src`                                                                        |                                                                          |
| 6   | `@typescript-eslint/no-explicit-any` and `no-non-null-assertion` as errors                                                                                                             | Currently warnings / off                                                 |
| 7   | Type-aware linting (`projectService: true`): `no-floating-promises`, `no-misused-promises`, `switch-exhaustiveness-check`, `explicit-module-boundary-types`                            | Slower; can run in CI and pre-push only                                  |
| 8   | `knip` in CI                                                                                                                                                                           | Unused files, exports and dependencies                                   |
| 9   | TV bundle size budget in CI                                                                                                                                                            |                                                                          |
| 10  | `noUncheckedIndexedAccess`, `noImplicitOverride` in every `tsconfig`                                                                                                                   | Per package, parsers first                                               |
| 11  | React Compiler, rolled out per directory with TV benchmarks                                                                                                                            |                                                                          |

### Baseline and ratchet

Turning a limit on can't wait for every existing file to comply, and it can't be a warning either:
warnings are ignored. So each limit is an error, and the files that break it today are listed in a
baseline (an `ignores` list per rule in `eslint.config.mjs`, generated by a script). The baseline
only shrinks:

- New files never enter it.
- A change that touches a baselined file doesn't make it bigger, and splits it when the change is
  substantial.
- A file that comes under the limit is removed from the baseline in the same change (CI checks that
  the baseline has no compliant files in it).

## Current debt

Measured 2026-11-21, source files only (no tests, `.d.ts` or migrations), out of about 1010. These
are raw line counts including blanks and comments, so the lint rule will flag somewhat fewer files:

| Over      | Files |
| --------- | ----- |
| 200 lines | 165   |
| 300 lines | 94    |
| 400 lines | 55    |
| 500 lines | 36    |
| 600 lines | 22    |

The largest: `services/media-load/src/storage/storage.service.ts` (1397),
`backend/src/services/playback/playback-session.service.ts` (1032),
`frontend/src/shared/navigation/store.ts` (998), `backend/src/services/realtime/realtime.gateway.ts`
(964), `backend/src/services/playback/audio-playback.service.ts` (928),
`backend/src/services/media/list.service.ts` (894), `backend/src/services/source/source.service.ts`
(891), `backend/src/services/auth/auth.service.ts` (874). 16 test files are over 500 lines.

Other debt against these standards:

| Standard                    | Debt                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| No hook-rule suppressions   | 31 `eslint-disable react-hooks/exhaustive-deps`                                                                  |
| Only typed errors           | 68 `new Error(...)` in backend services and repositories (most in `fragmented-mp4.ts` and the subtitle services) |
| No `console.*` in frontend  | 31 calls                                                                                                         |
| No `any`                    | About 27 outside tests and `.d.ts` files                                                                         |
| Memoisation by the compiler | 196 `useMemo`/`useCallback`, to remove after the compiler is on                                                  |
