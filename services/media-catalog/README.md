# Media catalog persistence

The catalog uses Drizzle ORM with Bun's native SQLite driver. Its schema is defined in `src/db/schema`; the service opens `catalog.db`, configures WAL/foreign-key pragmas, and runs Drizzle migrations automatically at startup.

`src/db/migrations/0000_burly_starjammers.sql` is the current pre-production baseline. It contains metadata and synchronization tables only; list definitions and list pages are owned by the standalone list service. Existing development catalog databases should be deleted and recreated after this extraction.

For every future schema change, update `src/db/schema` and generate a new Drizzle migration with `drizzle-kit generate`. Commit the schema, generated migration, journal update, and both lockfiles together.
