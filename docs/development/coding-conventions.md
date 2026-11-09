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

- **Unit tests**: tests beside code (`*.test.ts` in `backend/src/`), run with `npm run test:backend` from the root (`bun test --isolate` in `backend/`; without `--isolate` the Jest compatibility preload can't apply each file's mocks) using the Jest API
- **E2E tests**: Docker‑based suite in `backend-e2e/`

### Naming Rules

- Entities: `*.entity.ts`, services: `*.service.ts`, repos: `*.repository.ts`.
- camelCase variables; UPPERCASE constants.

### Going Back in the UI

The back rail (`BackRail` in `frontend/src/shared/ui/rail/BackRail.tsx`) is the preferred way to offer "go back" on inner pages, such as search, details, settings, Manage profiles and the profile editor. Don't add separate Back or Done buttons that only return to the previous screen. A form's Cancel, which discards changes, is a form action and can stay. Also handle the remote's Back key (Escape, Backspace, GoBack, 10009) through the page's keyboard scope. Pages with their own D-pad navigation pass `buttonAttributes` so the rail's button joins it. Leave the rail out when there is nothing to go back to, for example Who's watching at startup.
