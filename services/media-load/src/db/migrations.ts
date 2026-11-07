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
];
