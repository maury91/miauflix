# Media catalog persistence

The catalog uses Drizzle ORM with Bun's native SQLite driver. Its schema is defined in `src/db/schema`; the service opens `catalog.db`, configures WAL/foreign-key pragmas, and runs Drizzle migrations automatically at startup.

`src/db/migrations/0000_burly_starjammers.sql` is the current pre-production baseline. It contains metadata and synchronization tables only; list definitions and list pages are owned by the standalone list service. Existing development catalog databases should be deleted and recreated after this extraction.

For every future schema change, update `src/db/schema` and generate a new Drizzle migration with `drizzle-kit generate`. Commit the schema, generated migration, journal update, and both lockfiles together.

## TV title logos

Migration `0003_tv_show_logos.sql` adds a nullable logo URL without replacing rows. Existing shows keep their metadata, watching state and episode hierarchy. A null logo marks older rows for hydration on the next catalog read; an empty string records that the provider has no logo, so those shows retain the normal freshness TTL. TMDB TV details now include image assets and use a new cache key to avoid older image-free responses. Available logos pass through localization to the existing backend DTOs and media cards, alongside episode labels.

Rollback: deploy the previous catalog code and leave the additive column in place. Older readers/writers ignore it; no database reset or destructive down migration is needed.
