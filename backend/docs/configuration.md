# Assisted configuration

Miauflix manages application settings through the administrator's browser configuration editor and an interactive terminal wizard. Environment variables can provide bootstrap values; saved application settings live in the persistent configuration store rather than being written to a generated `.env` file.

## Features

- **Validation and defaults:** detects missing required settings and invalid values, with defaults for optional settings.
- **Browser configuration:** administrators can view settings, edit service groups, test draft values, save changes, and reload supported services.
- **Interactive terminal setup:** prompts for missing settings when the backend runs in an interactive terminal; command-line flags can force reconfiguration.
- **Service-specific configuration:** local services and the separate catalog, list, and sources services publish settings to the configuration UI.
- **Connection tests:** testable services can validate credentials or connectivity. Other groups report validation-only results rather than claiming a live connection test.
- **Persistent settings:** the backend writes application configuration to `config.json` in `DATA_DIR`, with secret values encrypted. Remote services manage their own persisted configuration through the management contract.
- **Generated secrets:** required generated secrets are saved so they survive restarts.

Keep the application and service data volumes, including their encryption keys, across container recreation. See [Docker setup](../../docs/setup/docker-setup.md) for deployment storage.

## Browser configuration

Open Settings → Configuration as an administrator. The editor displays settings grouped by service and masks stored secrets. Missing essential configuration still needs completing; optional integration prompts can be dismissed while browsing remains available.

The administrator API exposes these operations:

| Endpoint                            | Purpose                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `GET /api/config`                   | Read configuration metadata and values, with secrets masked               |
| `PUT /api/config`                   | Test and save submitted settings                                          |
| `POST /api/config/:service/test`    | Test draft settings without persisting them                               |
| `PUT /api/config/:service`          | Test and save one service group's settings                                |
| `POST /api/config/:service/restart` | Reload a registered service, or report that a process restart is required |

Write and test requests use `{ entries: [{ key, value }] }`, with string values. Unknown keys and keys belonging to the wrong group are rejected. A service may require a full process restart; not every setting can be applied live.

Implementation: [configuration routes](../src/routes/config.routes.ts) and [configuration service](../src/services/configuration/configuration.service.ts).

## Command-line options

Run these commands from the repository root. For local execution, the backend's supporting services must also be available; `npm run dev` starts the backend, frontend, catalog, list, and sources processes together.

### `--config`

Force the terminal wizard to offer all configuration groups, even if settings already exist:

```bash
npm run config
```

This runs the backend with `--config` and continues startup after setup. Interactive prompts require a terminal; the flag does not make a non-interactive container prompt for input.

### `--only-config`

Run the same forced configuration setup, then exit without starting the application server:

```bash
npm run config-only
```

For the Docker-based wizard from a repository checkout, use:

```bash
npm run config-only:docker
```

The browser editor is the simpler setup path for the supplied prebuilt-image deployment. See [Getting Started](../../docs/setup/getting-started.md).

## Startup and persistence

1. Load environment bootstrap values and defaults, adopting previously persisted generated secrets before initializing encryption.
2. Load saved application configuration. Saved values normally take precedence over environment values, which take precedence over defaults. Explicit environment values for generated secrets are an exception and take precedence over their saved values.
3. Discover remote service contracts and their configuration schemas, and make their settings available to the configuration system.
4. Detect missing values or failed service validation. Interactive terminals can run the wizard; non-interactive startup can continue in a degraded state so configuration remains possible from the browser or administrator API.
5. Test and save changes through the configuration system. Secret values saved through the configuration editor are encrypted. Generated bootstrap secrets are persisted automatically in plaintext in `config.json`, including `SOURCE_SECURITY_KEY`, which is needed to initialize the encryption service.

A Compose `.env` file controls deployment inputs such as image versions, VPN setup, and domain names. It is separate from saved application configuration. Compose values only reach a service when its deployment passes or mounts them; editing `.env` is not a substitute for updating a saved application setting through the configuration editor.

For setting names and ownership, see the [environment variables guide](../../docs/setup/environment-variables.md). For the boundary between local and remote services, see the [system overview](../../docs/architecture/system-overview.md#remote-contracts-and-configuration).
