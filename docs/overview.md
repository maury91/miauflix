## 📚 Backend Documentation Overview

This directory provides a layered reference for the **miauflix-bun** backend.
Start here and dive progressively deeper:

| Level | File                                                                          | What You’ll Find                                            |
| ----- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1     | **overview.md** (this file)                                                   | High-level map & quick links                                |
| 1     | [backend/README.md#documentation-hub](../backend/README.md#documentation-hub) | Documentation hub with organized links                      |
| 2     | [architecture.md](architecture.md)                                            | Tech‑stack snapshot (runtime, DB, torrent, external APIs)   |
| 2     | [directory-structure.md](directory-structure.md)                              | One‑level ASCII tree of `backend/`                          |
| 2     | [coding-conventions.md](coding-conventions.md)                                | Import style, env helper, error handling, tests             |
| 2     | [request-life-cycle.md](request-life-cycle.md)                                | Mermaid flow from Client → Hono → WebTorrent                |
| 3     | [extension-recipes.md](extension-recipes.md)                                  | Step‑by‑step guides (add route, new tracker, encrypt field) |
| 3     | [task-file-mapping.md](task-file-mapping.md)                                  | Roadmap tags ↔ key source files                            |
| 3     | [run-and-debug.md](run-and-debug.md)                                          | Dev commands & env setup                                    |
| 3     | [workflow.md](workflow.md)                                                    | Copilot iterative development workflow                      |

> **Tip:** Consult Level 2 docs when exploring, then Level 3 guides when building features.
