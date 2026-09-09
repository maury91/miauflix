# Media catalog persistence

The catalog uses Drizzle ORM with Bun's native SQLite driver. Its schema is defined in `src/db/schema.ts`; the service opens `catalog.db`, configures WAL/foreign-key pragmas, and runs Drizzle migrations automatically at startup.

`src/db/migrations/0000_catalog_baseline.sql` is intentionally idempotent. It adopts an existing catalog database in place and records that adoption in `__drizzle_migrations`; it never resets catalog, sync, list, or provider-cache data.

For every future schema change, update `src/db/schema.ts` and generate a new Drizzle migration with `drizzle-kit generate`. Commit the schema, generated migration, journal update, and both lockfiles together. Do not modify the baseline to represent a later schema change.
