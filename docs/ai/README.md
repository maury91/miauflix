# AI assistant documentation

Read [context.md](context.md) and [gotchas.md](gotchas.md) before making changes. They explain current ownership boundaries and repository constraints. Verify behavior and relevant checks against the implementation.

| Resource                                              | Purpose                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Current context](context.md)                         | Implemented systems, service ownership, and known limitations                 |
| [Gotchas](gotchas.md)                                 | Workspace, testing, data migration, encryption, and configuration constraints |
| [Development guide](development-guide.md)             | Code patterns, file locations, and workflow commands                          |
| [E2E and CI playbook](e2e-ci-playbook.md)             | Offline browser testing and visual verification                               |
| [Feature Guide](../features.md)                       | User-facing behavior and clearly marked future work                           |
| [System overview](../architecture/system-overview.md) | Runtime architecture and service boundaries                                   |
| [Current task list](../../ToDo.md)                    | Planned work; verify whether a listed component already exists                |

When behavior or ownership changes, update the relevant technical reference and feature page together. Keep operational instructions in the setup guides instead of copying them into multiple status summaries. Do not record passing build/test status without running the checks on the current checkout.
