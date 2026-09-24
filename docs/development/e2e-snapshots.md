# Updating initial setup E2E screenshots

The first-run setup test uses Playwright screenshots from Chromium on Linux. Regenerate them from the repository root with:

```sh
npm run test:frontend:e2e:initial-setup:update
```

This command uses the pinned Playwright `v1.56.1-jammy` image, starts a fresh backend E2E Compose project, and updates the initial-setup snapshots. Its fixture leaves the TMDB token and all three required Trakt values empty, matching `.github/workflows/ci.yml`. Keep these values explicit in `backend-e2e/scripts/update-initial-user-snapshots.sh`; inheriting credentials from a developer's environment can change which setup steps appear and produce misleading baselines.

Docker must be available with host networking enabled so the Playwright container can reach the E2E backend. The browser runs in a Linux container on the pinned Playwright image, so the generated baselines use the same platform and browser version as CI. The script tears down the `miauflix-tests` Compose project and its test volumes when it finishes.

After regeneration, review the changed images and run the setup flow against the new baselines without updating them:

```sh
npm run test:frontend:e2e:initial-setup:check
```

The check command uses the same Linux Playwright image and initial-setup fixture as the update command.

The test checks that the missing TMDB and Trakt settings are present before it captures the first screenshot. Its expected setup steps are **TMDB**, **Trakt**, and **Optional services**. The optional settings screenshot should not include Trakt, because those required values belong to the first-run flow.

Commit only the updated files under `frontend/e2e/initial-user-setup.e2e.spec.ts-snapshots/` when the image changes reflect the intended UI. Do not update snapshots to silence a failure until the actual and expected screenshots have been compared.
