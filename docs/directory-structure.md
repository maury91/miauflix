## 📂 Directory Cheat-Sheet

```text
backend/
└─ src/
  ├─ routes/ — Hono handlers
  ├─ services/ — domain logic
  ├─ database/ — TypeORM config & entities
  ├─ entities/ — TypeORM entity definitions
  ├─ repositories/ — data access layer
  ├─ middleware/ — auth, rate-limit, audit
  ├─ trackers/ — torrent clients
  ├─ utils/ — helpers (cache, limiter…)
  ├─ types/ — TypeScript type definitions
  ├─ errors/ — custom error classes
  └─ app.ts — entry point
└─ docs/ — markdown docs
└─ data/ — SQLite database files
└─ test-fixtures/ — test data files
```

_(no `migrations/`, no scheduled jobs)_
