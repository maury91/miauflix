## ✍️ Coding Conventions

### Modules & Imports

- Pure **ESM** (`"type":"module"` in _package.json_).
- TS path aliases (`@services/*`) in _tsconfig.json_.

### Environment Helper

- `constants.ts` exports `ENV()` for typed access; `.env` loaded via **dotenv**.

### Error Handling

All errors extend `AppError` (`@errors/base.error`) and carry a `type` (domain) and `code` (specific condition):

```typescript
import { RepositoryError } from '@errors/repository.errors';
// throw new RepositoryError('Movie not found', 'not_found');
// → error.type === 'repository', error.code === 'not_found'
```

Domain error files live in `backend/src/errors/`. **Never throw `new Error(...)` directly** in services or repositories — always use the appropriate typed class. See `backend/docs/errors.md` for the full error catalogue.

### Testing

- **Unit tests**: Jest tests beside code (`*.test.ts` in `backend/src/`)
- **E2E tests**: Docker‑based suite in `backend-e2e/`

### Naming Rules

- Entities: `*.entity.ts`, services: `*.service.ts`, repos: `*.repository.ts`.
- camelCase variables; UPPERCASE constants.
