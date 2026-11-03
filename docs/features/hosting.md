# Running your own Miauflix server

[Back to all features](../features.md)

Miauflix runs on a computer or server you control. Your browser or TV connects to that server to browse and play media.

## Docker deployment

The repository includes a Docker Compose setup, which starts the application and its supporting services together. The build and publishing workflow supports both AMD64 and ARM64 computers. Persistent storage keeps application data and downloads outside the disposable containers.

See [Docker setup](../setup/docker-setup.md) for installation instructions and configuration requirements.

## Setup and configuration in the browser

The initial setup creates an administrator account. Administrators can then configure the server through the browser, including its catalog, list, source, subtitle, and download settings.

The configuration system can test connection settings, report service status, and reload supported services after changes. Optional integrations do not all need to be configured before browsing; required configuration still needs completing.

## Catalog information and updates

Miauflix obtains descriptions, artwork, genres, and movie and TV information through its catalog service. The currently connected catalog provider is TMDB. Background jobs keep catalog information fresh, including season and episode information.

Episode updates can focus on shows being watched or cover all incomplete seasons, depending on the server configuration. The catalog is separate from source discovery: a description and poster do not mean a downloadable release has been found.

## Optional HTTPS

The optional Caddy deployment provides HTTPS for a configured domain. HTTPS encrypts the connection between a device and your server. It is separate from encrypting downloads on disk or routing torrent traffic through a VPN.

## Automatic updates and recovery

The supplied Compose setup includes an updater that checks for new Miauflix container images on a schedule. It also includes a health-check helper that can restart the application container when it becomes unhealthy. These are deployment features provided by the included supporting containers.

## Troubleshooting tools

An optional tracing setup sends timing information to Jaeger. This helps an administrator investigate slow requests and see where time is spent across services. It is a server troubleshooting tool, rather than a playback feature a viewer needs to configure.

## Separate, replaceable services

Catalog information, lists, and source searches run in separate services. Miauflix communicates with them through versioned contracts: agreed formats for requests, responses, configuration, and status.

Developers can run a compatible replacement service at a configured address, including in a separate Docker container. This requires implementing the expected contract. The current built-in catalog is TMDB and the built-in list integration is Trakt; the ordinary settings interface does not provide an arbitrary catalog or list-plugin installer.

See [Finding something to play](sources.md) for the simpler ways to add source providers.

## Implementation references

- [Default deployment and supporting containers](../../docker-compose.yml)
- [AMD64 and ARM64 publishing workflow](../../.github/workflows/ci.yml)
- [HTTPS deployment](../../docker-compose.https.yml)
- [Configuration endpoints](../../backend/src/routes/config.routes.ts)
- [Remote service contracts and configuration](../../backend/src/services/remote/remote-service.ts)
- [Current catalog provider](../../services/media-catalog/src/catalog/bootstrap.ts)
