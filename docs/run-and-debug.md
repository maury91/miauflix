## ▶️ Run & Debug

### Essential NPM Scripts

```bash
npm run dev:backend          # nodemon reload
npm run start:backend        # one-shot server
npm run start:backend:e2e &  # dockerised watch server (mock data) in *detached* mode
npm run test:backend         # Jest unit tests
npm run test:backend:e2e     # full e2e matrix
npm run test:backend:e2e:dev <file>  # run one e2e spec
```

### Requirements

- **Node 20+**
- `.env` with:

  ```env
  TMDB_API_ACCESS_TOKEN=
  JWT_SECRET=
  REFRESH_TOKEN_SECRET=
  TORRENT_KEY=          # Auto-generated if missing
  # Optional
  TRAKT_CLIENT_ID=
  TRAKT_CLIENT_SECRET=
  NORDVPN_PRIVATE_KEY=
  REVERSE_PROXY_SECRET=
  ```

- SQLite DB auto‑creates at `backend/data/database.sqlite`.
