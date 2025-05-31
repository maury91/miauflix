## 🗺️ Architecture Snapshot

| **Layer**         | **Library / Runtime**             | **Purpose**                     | **Key Areas**                                 |
| ----------------- | --------------------------------- | ------------------------------- | --------------------------------------------- |
| **HTTP API**      | **Node 20 ESM + Hono**            | Routing & middleware            | `src/app.ts`, `src/routes/*`                  |
| **Auth**          | **jose** (JWT) + bcrypt + Hono MW | Login, role guard               | `src/services/auth/*`, `src/middleware/*`     |
| **Database**      | **TypeORM 0.3 + SQLite**          | Persistence (auto-sync)         | `src/database/*`, `src/entities/*`            |
| **External APIs** | **TMDB**, **Trakt**, **NordVPN**  | Metadata, list-sync, VPN status | `src/services/tmdb/*`, `src/services/trakt/*` |
| **Torrent**       | **YTS API** + **WebTorrent**      | Discover & stream magnets       | `src/trackers/*`, `src/services/source/*`     |
