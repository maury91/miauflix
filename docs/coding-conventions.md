## ✍️ Coding Conventions

### Modules & Imports

- Pure **ESM** (`"type":"module"` in _package.json_).
- TS path aliases (`@services/*`) in _tsconfig.json_.

### Environment Helper

- `constants.ts` exports `ENV()` for typed access; `.env` loaded via **dotenv**.

### Error Handling

- Services throw domain errors → handled by `app.onError` → JSON response.

### Testing

- **Unit tests**: Jest tests beside code (`*.test.ts` in `backend/src/`)
- **E2E tests**: Docker‑based suite in `backend-e2e/`

### Naming Rules

- Entities: `*.entity.ts`, services: `*.service.ts`, repos: `*.repository.ts`.
- camelCase variables; UPPERCASE constants.
