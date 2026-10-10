# Trakt playback synchronization

The backend progress endpoint saves Miauflix progress locally, then sends a small
internal request to the List Service. The List Service writes an encrypted durable
outbox and acknowledges without waiting for Trakt. Frequent playing positions for
the same playable replace a pending position; completion events are retained
separately. Local progress remains available if the List Service is unavailable.

A List Service worker runs every five seconds. It exports start, pause and finish
scrobbles, limits playing heartbeats to one per minute, serializes provider traffic, spaces writes by
at least one second and reads by 300 milliseconds, and observes the shared Trakt `Retry-After` cooldown. Failed
exports remain queued and retry after backoff, including after a service restart.
Updates received during an export are protected by an outbox revision check.

The worker refreshes paused playback and watched history approximately once per
minute. Initial history import follows all pages; subsequent imports request
history since the latest cached watched timestamp. Snapshots are encrypted at
rest and belong to a specific account connection. Disconnecting or replacing the
connection makes its snapshot and pending work inaccessible immediately; the
worker removes obsolete records.

`GET /api/progress` merges the local records with the cached Trakt snapshot by
playable identity and timestamp; local progress wins ties. Pending outbound
playables are excluded from the remote snapshot so a delayed provider timestamp
cannot override a newer local position. Imported records are never exported back,
avoiding a synchronization loop. Watched records prevent older paused records
from appearing in Continue watching.

Started shows also receive Trakt's next unwatched episode, excluding shows hidden
from watched progress and shows with no next episode. These entries start at zero
without being mistaken for saved paused positions; an actual paused episode takes
priority for the same show.

The home page refreshes progress every minute. Imported paused records use the
Trakt movie or episode runtime; the player converts their percentage to the
selected video's actual duration before seeking. Items lacking a usable TMDB
identity or runtime cannot safely be resumed and are skipped. Pause, resume and
finish events save immediately; the player's periodic heartbeat stops while
paused.

The durable outbox starts after the List Service accepts a progress update. If the
List Service itself is unavailable, the backend still saves local progress and
logs the export failure; the next playback report can enqueue the latest position.
Existing local records are not bulk-exported on account connection.

Trakt rejects pauses above 80% progress and requires a stop scrobble. Such late
pauses are exported using stop; Trakt can mark them watched while Miauflix keeps
the exact local position.
