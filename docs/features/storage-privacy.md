# Downloads, storage, and privacy

[Back to all features](../features.md)

Miauflix downloads media as it plays and manages the files on your server. It also provides storage and network controls for the person running that server.

## Encrypted downloads and sensitive records

Downloaded torrent pieces are encrypted on disk. Selected sensitive application records, such as media paths and viewing-related information, are also encrypted. Media inspection and conversion can read decrypted data through a local connection without saving a separate plaintext copy of the video.

Encryption depends on keeping the server's keys safe. It does not mean every database field is encrypted or that torrent traffic becomes anonymous. Network privacy is handled separately through the VPN setup below.

## Reusing downloads and seeding

A completed download can be reused the next time someone watches it. After completion, Miauflix can keep sharing it with other torrent users for a configured period. This sharing is called seeding.

When the seeding period ends, Miauflix can disconnect the torrent while retaining its encrypted files locally. Ending seeding and deleting the download are separate actions.

## Automatic space management

Miauflix tracks downloaded and reserved space against its storage budget. When it needs to reclaim space, it considers how files are currently being used and protects active playback. Retained downloads may eventually be removed to make room for other content.

This means a previously downloaded title is not guaranteed to stay on disk forever. It may need downloading again after cleanup.

## Storage dashboard and manual cleanup

Administrators can see storage use, the configured budget, reserved space, and free disk space. The download list shows completion, disk use, activity, and whether a download is seeding or retained locally.

An administrator can confirm removal of an inactive download to free space. Removal is blocked while it is being actively streamed.

## Connection and bandwidth limits

The server has configurable limits for torrent connections, download speed, upload speed, and seeding duration. These controls help the administrator balance playback against other uses of the server and internet connection. Preloading and playback buffering are explained under [Watching](watching.md).

## VPN checks and NordVPN deployment

A VPN routes traffic through another server. Miauflix checks VPN status and uses it to gate source and download activity unless checks are explicitly disabled. The implemented detector recognizes NordVPN-protected connections; it is not a general detector for every VPN brand.

The optional Docker VPN setup runs Miauflix and its services through Gluetun with NordVPN. That setup provides the network tunnel and firewall, while Miauflix's own checks monitor whether the connection is recognized as protected.

## Planned improvements

The [VPN task list](../../ToDo.md#vpn) proposes a Settings screen for checking tunnel speed and connection health, and choosing a country or individual exit server. This would help distinguish a slow VPN connection from a slow torrent.

A country can already be configured in the Docker VPN setup; the planned feature is an interactive Settings experience and connection diagnostics.

## Implementation references

- [Encrypted torrent storage](../../backend/src/chunk-stores/encrypted-chunk-store/encrypted-chunk-store.ts)
- [Storage budgeting and cleanup](../../backend/src/services/storage/storage.service.ts)
- [Download retention and seeding](../../backend/src/services/download/download.service.ts)
- [Storage dashboard](../../frontend/src/pages/settings/StoragePage.tsx)
- [VPN detection](../../backend/src/services/security/vpn.service.ts)
- [Docker VPN setup](../../docker-compose.vpn.yml)
