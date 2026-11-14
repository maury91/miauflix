/**
 * Ordered schema migrations; `PRAGMA user_version` records how many ran. Never edit a shipped
 * entry: append a new one.
 *
 * Dates are epoch milliseconds. Paths (`k`), layouts and source descriptors are encrypted with
 * the host's key; paths deterministically, so they can be looked up and kept unique.
 */
export const migrations: string[] = [
  `CREATE TABLE source (
    id INTEGER PRIMARY KEY,
    descriptor TEXT NOT NULL,
    file BLOB,
    updatedAt INTEGER NOT NULL
  );
  CREATE TABLE storage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sourceId INTEGER NOT NULL UNIQUE REFERENCES source(id),
    downloadedPieces BLOB NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    logicalBytes INTEGER NOT NULL DEFAULT 0,
    verifiedBytes INTEGER NOT NULL DEFAULT 0,
    allocatedBytes INTEGER NOT NULL DEFAULT 0,
    reservedBytes INTEGER NOT NULL DEFAULT 0,
    totalPieces INTEGER NOT NULL DEFAULT 0,
    pieceLength INTEGER NOT NULL DEFAULT 0,
    lastInterestAt INTEGER,
    videoCompletedAt INTEGER,
    localOnly INTEGER NOT NULL DEFAULT 0,
    encryptedLayout TEXT,
    activeStreams INTEGER NOT NULL DEFAULT 0,
    downloaded INTEGER NOT NULL DEFAULT 0,
    location TEXT NOT NULL,
    lastAccessAt INTEGER,
    lastWriteAt INTEGER,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
  CREATE INDEX idx_storage_last_access ON storage (lastAccessAt);
  CREATE TABLE storage_file (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storageId INTEGER NOT NULL REFERENCES storage (id) ON DELETE CASCADE,
    k TEXT NOT NULL,
    offset INTEGER NOT NULL,
    length INTEGER NOT NULL,
    completedAt INTEGER,
    UNIQUE (storageId, k)
  );
  CREATE TABLE storage_file_claim (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storageId INTEGER NOT NULL REFERENCES storage (id) ON DELETE CASCADE,
    k TEXT NOT NULL,
    kind TEXT NOT NULL,
    ownerKey TEXT NOT NULL,
    rangeStart INTEGER NOT NULL DEFAULT 0,
    rangeEnd INTEGER,
    expiresAt INTEGER,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    UNIQUE (storageId, k, kind, ownerKey)
  );
  CREATE INDEX idx_claim_storage ON storage_file_claim (storageId);
  CREATE INDEX idx_claim_expires ON storage_file_claim (expiresAt);
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // Transfer statistics: lifetime totals per source, and 5-second samples (kept for a day).
  `ALTER TABLE storage ADD COLUMN totalDownloaded INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE storage ADD COLUMN totalUploaded INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE transfer_sample (
    storageId INTEGER NOT NULL REFERENCES storage (id) ON DELETE CASCADE,
    at INTEGER NOT NULL,
    downloadSpeed INTEGER NOT NULL,
    uploadSpeed INTEGER NOT NULL,
    peers REAL NOT NULL,
    PRIMARY KEY (storageId, at)
  ) WITHOUT ROWID;
  CREATE INDEX idx_transfer_sample_at ON transfer_sample (at);`,
  // Downloads nobody claims kept reserving their full size, so a new download evicted finished
  // ones to make room for space that was never going to be used: charge them what is on disk.
  `UPDATE storage SET reservedBytes = 0
    WHERE reservedBytes > allocatedBytes
      AND activeStreams = 0
      AND NOT EXISTS (SELECT 1 FROM storage_file_claim c WHERE c.storageId = storage.id);`,
  // TV remuxes of stored files (HLS segments and subtitle sidecars, encrypted files under the
  // storage's directory) go with their storage. Plans and sidecar details are encrypted.
  `CREATE TABLE remux (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storageId INTEGER NOT NULL REFERENCES storage (id) ON DELETE CASCADE,
    k TEXT NOT NULL,
    plan TEXT NOT NULL,
    priority INTEGER NOT NULL,
    state TEXT NOT NULL,
    readySeconds REAL NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    completedAt INTEGER,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    UNIQUE (storageId, k)
  );
  CREATE INDEX idx_remux_queue ON remux (state, priority, createdAt);
  CREATE TABLE remux_file (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remuxId INTEGER NOT NULL REFERENCES remux (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    seq INTEGER,
    duration REAL,
    meta TEXT,
    size INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    UNIQUE (remuxId, name)
  );`,
  // Remuxes were fMP4 HLS with E-AC-3, which AVPlay on Tizen 5.5 does not play: they are failed
  // so the next request rebuilds them (as MPEG-TS with AC-3) from a new plan, and that rebuild
  // deletes their old files.
  `DELETE FROM remux_file;
  UPDATE remux SET state = 'failed', error = 'Rebuilt as MPEG-TS', readySeconds = 0, bytes = 0,
    completedAt = NULL;`,
  // Room held for a TV remux being written, on top of the download's own commitment (allocation
  // or reservation): the remux's estimated size, charged until the remux ends.
  `ALTER TABLE storage ADD COLUMN remuxReservedBytes INTEGER NOT NULL DEFAULT 0;`,
];
