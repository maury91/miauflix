# Downloads, storage, and privacy

[Back to all features](../features.md)

Miauflix downloads media as it plays and manages the files on your server. It also provides storage and network controls for the person running that server.

## Encrypted downloads and sensitive records

Downloaded torrent pieces are encrypted on disk. Selected sensitive application records, such as media paths and viewing-related information, are also encrypted. Media inspection and conversion can read decrypted data through a local connection without saving a separate plaintext copy of the video.

Encryption depends on keeping the server's keys safe. It does not mean every database field is encrypted or that torrent traffic becomes anonymous. Network privacy is handled separately through the VPN setup below.

## What the disk shows

Miauflix is built to run on a rented server (a VPS). The aim is that an automated scan of that server's disk finds nothing that identifies a download, without someone first studying how Miauflix works. For each download started with the current version:

- **Its own random key.** Each download gets two random values when it starts. One gives it its own encryption key, derived from the server's master key (`SOURCE_SECURITY_KEY`); the other names its files. Neither comes from the torrent, so knowing a torrent's info hash does not tell you where its files are or how to decrypt them, even with the master key.
- **Random names.** The download's folder has a random name, and each file's name is a keyed hash of its path. Nothing on disk carries a torrent name, info hash, or file name. Names alone do not hide a download: file sizes can still be matched to known torrents, which is what size padding covers.
- **No shared encryption.** Every byte position in a download is encrypted differently, and no two downloads share a key, so knowing one file's content does not help decrypt another.
- **Size padding.** Encrypted files otherwise keep their exact size, and a torrent's file sizes are close to unique. Each file is padded with random bytes to a rounded size: files over 64 KiB grow by at most about 3%, and smaller files all take 64 KiB. `STORAGE_PAD_FILE_SIZES=false` turns it off, and then sizes can identify downloads despite the random names. See [Environment Variables](../setup/environment-variables.md).
- **Clean logs.** Logs name downloads by an internal number. In everything written through Miauflix's loggers, anything that looks like an info hash or magnet link, including inside library errors, is replaced with `[redacted]`. `docker logs` keeps logs on the server, so this matters as much as the files. Output that bypasses the loggers is not redacted: media-load's crash output (an uncaught error printed by the runtime), and the torrent libraries' own debug output when `DEBUG=*` is set.

What still links downloads to torrents is media-load's database: each download's random values, its file list and name, and its source (info hash, magnet link, `.torrent` file), all encrypted with the master key. The same database also keeps each file's exact length and offset, the piece length and the total size unencrypted, since storage accounting needs them; these are exact even when the files on disk are padded. The backend's database holds the sources too. Today both live on the same server as the master key, so someone holding a full copy of the disk can decrypt everything. That takes knowing this project, which is the line this design draws: it keeps a server from being flagged by generic scanning, not from an investigation that already targets it.

### Limits

- **Older downloads keep the earlier scheme.** Downloads started before per-download keys use one key for every download and folder names that can be computed from the info hash. They stay readable as they are, until they are deleted or cleaned up.
- **The running server holds the keys in memory.** A provider that snapshots a running machine's memory gets them.
- **Still visible on disk:** how many files a download has and, with padding, their rounded sizes; and how much space downloads use in total. While a download is incomplete, on filesystems that support sparse files, the gap between unwritten data and the padding can show a file's original length.
- **Still visible in the database:** exact file lengths and offsets, piece length and total size, unencrypted, next to the encrypted records.
- **The network side is separate.** Torrent traffic, tracker requests, and source searches go through the [VPN](#vpn-checks-and-nordvpn-deployment); without it, peers see the server's IP.

### Keeping the master key off the disk

Miauflix saves `SOURCE_SECURITY_KEY` in its `config.json` on first start. When it is passed as an environment variable instead, Miauflix uses it without saving it. See [Secrets set in `.env`](../setup/docker-setup.md#secrets-set-in-env).

That alone does not take the key off the disk:

- **A copy saved earlier stays in `config.json`.** Passing the variable does not remove it.
- **A key in `.env` is on the disk too**, in the file Compose reads it from.

To keep the key off the server, remove the local copies securely and supply the same key from outside the server each time it starts, for example from a secrets manager or by hand. Keep a secure backup of it elsewhere: without it, downloads and encrypted records cannot be read.

Even then, this does not hide anything on its own, since the database next to it is encrypted with that same key, but it is half of the planned external database below.

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

### Planned: external database

The [storage privacy tasks](../../ToDo.md#storage-privacy) plan an optional external database, such as AWS RDS. Everything in media-load's database, and the backend's sources, would live there instead of on the server. The two halves would then each be useless alone:

| Where                 | What it holds                                                               | Alone, it reveals                                                                                            |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The server            | The master key and the encrypted files, with random names                   | Nothing, as long as file sizes are padded: keys and names come from random values that are not on the server |
| The external database | Each download's random values and its source, encrypted with the master key | Nothing: the master key is not there                                                                         |
| Both                  | Everything                                                                  | Which torrents were downloaded, and their content                                                            |

Deleting a download's record in the external database makes its files unreadable for good. Wiping the database does the same for every download.

Things to know before relying on it:

- **Backups count.** Managed databases keep automated backups and snapshots, for days or weeks. Wiping the data means deleting those too.
- **The connection string is on the server.** Anyone holding a copy of the disk can reach the database with it until you revoke it, so you need to notice and act first.
- **Memory still holds both halves** while Miauflix runs.

A further option, **locked boot**, would keep the master key encrypted and ask for a passphrase at startup, from the command line or the browser. A stopped server's disk would then hold nothing usable, at the cost of entering the passphrase after every restart.

## Implementation references

- [Encrypted torrent storage](../../services/media-load/src/chunk-stores/encrypted-chunk-store/encrypted-chunk-store.ts)
- [Storage budgeting and cleanup](../../services/media-load/src/storage/storage.service.ts)
- [Download retention and seeding](../../services/media-load/src/engine/download.service.ts)
- [Storage dashboard](../../frontend/src/pages/settings/StoragePage.tsx)
- [VPN check](../../packages/vpn-guard/src/vpn-guard.ts)
- [Docker VPN setup](../../docker-compose.vpn.yml)
