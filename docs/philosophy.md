# Philosophy

Miauflix aims to make a self-hosted streaming service approachable while keeping control with the person running it. These principles describe the design goals. The [feature guide](features.md) explains what is implemented, and [ToDo.md](../ToDo.md) tracks unfinished work.

## Simplicity

Starting Miauflix on your own computer or server should require as little setup as practical. The supplied Docker Compose deployment starts the application and supporting services together, and the browser guides you through creating the first administrator and configuring required integrations. Using prebuilt images does not require cloning the repository.

The deployment contains multiple containers; the viewer still has one app to open. Optional Compose files add HTTPS for a domain, a VPN, FlareSolverr, or tracing. See [Docker setup](setup/docker-setup.md) for the supported installation path.

## Resilience

Miauflix searches several sources so playback is not tied to one indexer. Supported Cardigann definitions describe how to search sites without adding site-specific code to the backend. Administrators can manage providers and definition repositories, and can connect an external Jackett or Prowlarr through Torznab.

The search planner caches results, applies request budgets, and backs off from failing providers. The backend separately verifies video files and can try another source when one is unusable. These mechanisms improve resilience; they cannot make a release available if nobody is sharing it or guarantee access to every indexer. Cardigann support is a subset, with unsupported definitions and private-tracker sign-in flows excluded.

Catalog, list, and source services have separate ownership and versioned communication contracts. A developer can supply a compatible replacement service; an arbitrary Docker image does not automatically become a plugin. See [source features](features/sources.md) and [system architecture](architecture/system-overview.md).

## Privacy and controlled access

Downloaded torrent pieces and selected sensitive application fields are encrypted at rest. The application needs its encryption keys while running, so someone with root access to the host could also obtain those keys and read the data. This is not whole-database encryption or protection against a fully compromised host. Persistent keys must be kept with the data they protect.

HTTPS protects traffic between a device and the server. The optional Gluetun/NordVPN deployment routes outbound traffic through a VPN and supplies a network firewall; application VPN checks are a separate safeguard. A VPN does not replace HTTPS, and encrypted storage does not make torrent traffic anonymous.

Miauflix uses administrator-created accounts rather than open self-registration. The first administrator is created during setup; additional account creation exists in the API, while its management screen remains planned. Password and QR-code login identify a Miauflix account. Connecting Trakt is separate from signing in to Miauflix.

The supplied Compose file binds the app to localhost initially. Exposing it to a network requires completing setup and choosing the appropriate access and HTTPS configuration. See [storage and privacy](features/storage-privacy.md) and [accounts](features/accounts.md).

## Speed

The goal is for playback to begin quickly after the viewer presses Watch Now. An under-two-second start is an aspiration, not a guarantee: source availability, peer speeds, server resources, and media inspection or conversion all affect startup.

Miauflix works ahead where it has evidence of viewing intent. Background jobs refresh catalog information and lists and discover sources. Focusing a title can prepare torrent information, initial file pieces, and audio/subtitle inspection. During playback, the download layer reads ahead, and TV playback can prefetch the next episode. Suitable completed downloads are reused.

Miauflix can stream before the whole file has downloaded. It avoids unnecessary re-encoding when the device can play the original audio and video, and converts supported media only when needed for delivery. See [watching](features/watching.md) and [audio and subtitles](features/audio-subtitles.md).
