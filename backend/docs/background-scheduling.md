# Background scheduling

Miauflix uses Bunqueue for all recurring work. The schedule definitions live next to
their owning domain:

- `services/source/source.schedule.ts` — source discovery, metadata, and statistics seeds
- `services/cache/cache.schedule.ts` — cache cleanup
- `services/media/list.schedule.ts` — one refresh schedule per configured list
- `services/catalog/catalog.schedule.ts` — catalog change scans and season hydration

`ServiceScheduleCoordinator` is the lifecycle boundary. It connects to Bunqueue,
upserts the desired schedules, retries broker failures, removes stale list and legacy
schedules, and waits for reconciliation to finish during shutdown.

| Work                     | Default interval | Starts immediately |
| ------------------------ | ---------------: | :----------------: |
| Source discovery seed    |        5 seconds |        Yes         |
| Source metadata seed     |         1 second |        Yes         |
| Source statistics seed   |       30 seconds |        Yes         |
| List refresh             |           1 hour |        Yes         |
| Catalog movie/show scans |       90 minutes |        Yes         |
| Incomplete season seed   |        5 seconds |        Yes         |
| Cache cleanup            |          6 hours |         No         |

Every schedule is durable, prevents overlap, retries failed jobs with exponential
backoff, and skips missed historical runs after a restart. Existing configured interval
values remain authoritative; the defaults above apply to new or unset configuration.
