import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { migrations } from '../../src/db/migrations';

describe('migration 3: unclaimed reservations', () => {
  it('clears the reservation of idle unclaimed storage and keeps claimed or streamed ones', () => {
    const db = new Database(':memory:');
    for (const migration of migrations.slice(0, 2)) db.run(migration);
    const storage = (id: number, reserved: number, allocated: number, streams = 0) => {
      db.run(`INSERT INTO source (id, descriptor, updatedAt) VALUES (${id}, 'd', 0)`);
      db.run(
        `INSERT INTO storage (id, sourceId, downloadedPieces, reservedBytes, allocatedBytes,
           activeStreams, location, createdAt, updatedAt)
         VALUES (${id}, ${id}, x'', ${reserved}, ${allocated}, ${streams}, '/d/${id}', 0, 0)`
      );
    };
    storage(1, 1000, 10); // idle, unclaimed: cleared
    storage(2, 1000, 10); // claimed: kept
    storage(3, 1000, 10, 1); // streamed: kept
    storage(4, 100, 500); // already measured past its reservation: untouched
    db.run(
      `INSERT INTO storage_file_claim (storageId, k, kind, ownerKey, createdAt, updatedAt)
       VALUES (2, 'k', 'watched', 'user:u:m:1', 0, 0)`
    );

    db.run(migrations[2]);

    const reserved = db.query('SELECT id, reservedBytes FROM storage ORDER BY id').all() as Array<{
      id: number;
      reservedBytes: number;
    }>;
    expect(reserved.map(row => row.reservedBytes)).toEqual([0, 1000, 1000, 100]);
  });
});
