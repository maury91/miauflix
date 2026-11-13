# Architecture

These references describe Miauflix's implemented runtime, ownership boundaries, and data invariants. Use the [Feature Guide](../features.md) for viewer-facing explanations and [ToDo.md](../../ToDo.md) for planned work.

| Reference                                                                          | Scope                                                                                        |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [System overview](system-overview.md)                                              | Application and supporting services, authentication, playback, storage, and deployment       |
| [Architecture diagrams](diagrams.md)                                               | Runtime connections, data ownership, account linking, playback, and deployment flows         |
| [Service contracts](service-contract-v2.md)                                        | Typed calls, streams, subscriptions, WebSocket protocol, configuration, and readiness        |
| [External synchronization and query fallback](external-sync-and-query-fallback.md) | Catalog hydration, list projections, source searches, caches, jobs, and failure boundaries   |
| [Source identity and file claims](source-identity-and-file-claims.md)              | Source associations, explicit targets, file claims, retention, reclamation, and concurrency  |
| [TV source and episode playback](tv-source-support.md)                             | Episode matching, authorization, prefetch, watchlist acquisition, credits, and notifications |
| [Trakt playback synchronization](trakt-playback-sync.md)                           | Local progress, durable export, provider snapshots, merging, and connection isolation        |

Implementation links in each reference identify the modules that own its behavior. Internal service protocols are distinct from the public `/api` routes and realtime browser connection.
