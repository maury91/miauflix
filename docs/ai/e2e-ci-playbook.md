# E2E and CI Playbook

This is the working checklist for changes that touch the browser UI, API calls made by the browser, or Playwright screenshots. It records the failure pattern from PR #48 and the checks that would have caught it before pushing.

## What the PR #48 failures taught us

The details jobs run as an ordered sequence inside the `e2e-tests` GitHub Actions job:

1. ordinary Docker-backed E2E tests;
2. initial-user setup E2E;
3. details-page preparation;
4. offline details voting.

The later step is skipped when an earlier step fails. A green local voting test therefore does not prove that the workflow will reach it, and a failure in details preparation can hide an independent voting failure. Run the details preparation and voting commands separately before running the complete workflow.

The details preparation screenshot is a single generic baseline:

`frontend/e2e/details-preparation.e2e.spec.ts-snapshots/details-page-source-ready.png`

CI currently runs on Ubuntu, so that baseline must be produced or verified in the same Linux Playwright environment. A screenshot captured on macOS can differ in font rasterization and still look correct to a human. Do not overwrite this generic baseline from a host run without comparing the actual image; use the CI artifact or regenerate it in the CI Playwright container.

The voting lane uses the projects from `playwright.config.e2e.ts` (desktop, mobile, and high-DPI). Its snapshots include project/platform names, so a host update can create Darwin files while the existing Linux files remain required by CI. Keep both platform baselines when both environments are supported, and update every project intentionally.

The offline harnesses reject unknown API requests. That is deliberate: it catches UI changes that add a request without a deterministic test response. During this work, the voting lane exposed the missing `POST /api/media/backdrop-focus/background` handler. The fix belonged in the harness, with a response matching the application contract, before regenerating snapshots.

## Focused commands

Run these from the repository root:

```bash
# First prove the current baselines without changing them.
npm run test:e2e:details --workspace frontend
npm run test:e2e:details-voting --workspace frontend

# Only after inspecting an intentional visual change, regenerate each lane.
npm run test:e2e:details --workspace frontend -- --update-snapshots
npm run test:e2e:details-voting --workspace frontend -- --update-snapshots
```

The details voting command should report seven passing tests and two skipped visual cases with the current project matrix. The exact count can change when the test file changes; the important check is that every non-skipped test passes and no `Unexpected ... E2E request` error appears.

For changes that affect the Docker-backed browser flow, also run the relevant root command:

```bash
npm run test:e2e
npm run test:frontend:e2e:initial-setup
```

These commands require the E2E Docker environment. They are the closest local proof of the CI `e2e-tests` job.

## Snapshot update rules

The home-hero artwork lane hides source preparation through `home-hero.screenshot.css` and
fixes its height during capture. Hiding an asynchronous badge with `visibility` alone leaves
its changing height in the layout, shifting the logo and metadata even when the backdrop is
unchanged. Keep this normalization in the capture stylesheet and use the shared screenshot
tolerance; regenerate Linux baselines after intentional layout changes instead of increasing
the pixel allowance.

1. Run the lane without `--update-snapshots` and save the failure output.
2. Inspect the actual and expected images. A pixel diff caused by a platform baseline is not evidence of a UI regression.
3. If the UI change is intended, update only the affected lane and project.
4. Check `git status` and confirm that every new or changed snapshot is expected. Do not commit generated reports, traces, or test-result directories.
5. For a generic snapshot used by Linux CI, regenerate in the CI-compatible Playwright image or copy the verified CI artifact. Do not use a macOS image as the only baseline.
6. Re-run the lane without updates. An update command succeeding only proves that files were written; the no-update run proves they match.

## Mock and harness rules

- Treat every `Unexpected ... E2E request` failure as a missing contract in the harness, not as a reason to loosen the catch-all route.
- Add the handler to every offline harness that exercises the affected screen. Details preparation and details voting currently have separate route interceptors.
- Match both pathname and HTTP method so an accidental method change fails loudly.
- Return the response shape the frontend expects. For request bodies, validate the important fields rather than returning an unrelated empty object.
- Keep the route handler before the final throwing branch so new unmocked requests remain visible.

## Pre-push gate

For a browser or snapshot change, use this order:

```bash
npm run format:check
npm run check:ts
npm test
npm run test:e2e:details --workspace frontend
npm run test:e2e:details-voting --workspace frontend
```

Run the Docker-backed commands as well when the change touches shared application startup, authentication, routing, backend APIs, or the ordinary E2E harness. Commit only after the focused tests pass without snapshot updates and the working tree contains no accidental generated artifacts.

## Triage order when CI fails

1. Identify the first failing step in the job; later lanes may be skipped rather than passing.
2. Download the Playwright report and inspect the actual screenshot, diff, and trace.
3. If the error is an unexpected request, add or correct the deterministic route mock and rerun the focused offline lane.
4. If the error is a screenshot mismatch, determine whether the runner platform, browser version, font, or intended UI changed before updating a baseline.
5. Re-run the exact lane locally without updates, then run the preceding lane because CI ordering matters.
