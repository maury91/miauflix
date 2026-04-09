# Error System

All backend errors extend the `AppError` base class and carry a machine-readable `type` and `code` so callers and middleware can handle them precisely without matching on message strings.

## Base Class

```typescript
// backend/src/errors/base.error.ts
class AppError extends Error {
  type: string; // domain (e.g. 'auth', 'repository')
  code: string; // specific condition (e.g. 'not_found')
}
```

`error.name` is automatically set to `"type/code"` (e.g. `"repository/not_found"`).

## Usage

```typescript
import { RepositoryError } from '@errors/repository.errors';

// Throw
throw new RepositoryError('Movie not found', 'not_found');

// Catch and inspect
catch (err) {
  if (err instanceof RepositoryError && err.code === 'not_found') {
    return c.json({ error: 'Not found' }, 404);
  }
}
```

## Error Catalogue

### `auth` — `@errors/auth.errors`

| Class                     | Code                       | Message                   |
| ------------------------- | -------------------------- | ------------------------- |
| `LoginError`              | `invalid_credentials`      | Invalid credentials       |
| `AuthError`               | `unauthorized`             | Authentication required   |
| `RoleError`               | `insufficient_permissions` | Insufficient permissions  |
| `InvalidTokenError`       | `invalid_token`            | Invalid token             |
| `UserAlreadyExistsError`  | `user_already_exists`      | User already exists       |
| `AdminAlreadyExistsError` | `admin_already_exists`     | Admin user already exists |

---

### `repository` — `@errors/repository.errors`

Single class `RepositoryError(message, code)`.

| Code              | When used                                                      |
| ----------------- | -------------------------------------------------------------- |
| `create_failed`   | Database upsert returned no identifier                         |
| `retrieve_failed` | Entity not found immediately after creation                    |
| `id_required`     | Operation requires an entity ID that is missing                |
| `not_found`       | Entity lookup returned null                                    |
| `duplicate`       | Unique constraint conflict (e.g. Trakt account already linked) |

---

### `encryption` — `@errors/encryption.errors`

Single class `EncryptionError(message, code)`.

| Code                  | When used                                             |
| --------------------- | ----------------------------------------------------- |
| `key_required`        | `SOURCE_SECURITY_KEY` env var is missing              |
| `invalid_key_length`  | Key decodes to != 32 bytes                            |
| `invalid_key_format`  | Key is not valid base64                               |
| `encrypt_failed`      | AES-GCM cipher operation failed                       |
| `invalid_data_length` | Encrypted buffer is shorter than IV + tag             |
| `decrypt_failed`      | AES-GCM decipher failed (wrong key or corrupted data) |

---

### `scheduler` — `@errors/scheduler.errors`

Single class `SchedulerError(message, code)`.

| Code                | When used                                                    |
| ------------------- | ------------------------------------------------------------ |
| `already_scheduled` | `scheduleTask` called with a name that is already registered |
| `not_scheduled`     | `cancelTask` called with a name that does not exist          |

---

### `api` — `@errors/api.errors`

Class `ApiError(message, code, service?, status?)` where `service` is the external service name (e.g. `'trakt'`, `'tmdb'`, `'yts'`, `'therarbg'`) and `status` is the HTTP status code when applicable.

| Code               | When used                                                  |
| ------------------ | ---------------------------------------------------------- |
| `http_error`       | Non-2xx HTTP response from external API                    |
| `not_configured`   | Required credential/URL env var is missing                 |
| `connection_error` | Cannot reach external API (non-HTTP failure)               |
| `invalid_response` | Response body is HTML or non-JSON when JSON expected       |
| `timeout`          | Request exceeded configured timeout                        |
| `validation_error` | Input failed pre-request validation (e.g. bad IMDB ID)     |
| `response_error`   | API returned an error payload in the body (e.g. Trakt 400) |

---

### `media` — `@errors/media.errors`

Single class `MediaError(message, code)`.

| Code              | When used                                    |
| ----------------- | -------------------------------------------- |
| `list_not_found`  | Slug does not match any known list           |
| `genre_not_found` | Genre ID missing from local cache after sync |
| `genres_failed`   | `ensureGenres` threw during TMDB sync        |

---

### `vpn` — `@errors/vpn.errors`

Single class `VpnError(message, code)`.

| Code                   | When used                                          |
| ---------------------- | -------------------------------------------------- |
| `http_error`           | IP-provider endpoint returned non-2xx              |
| `invalid_ip`           | Provider returned a value that fails IP validation |
| `all_providers_failed` | Every configured IP provider exhausted             |

---

### `request` — `@errors/request.errors`

Single class `RequestError(message, code)` — covers FlareSolverr proxy errors.

| Code             | When used                                           |
| ---------------- | --------------------------------------------------- |
| `not_configured` | `FLARESOLVERR_URL` env var is missing               |
| `api_error`      | FlareSolverr HTTP endpoint returned non-2xx         |
| `solver_error`   | FlareSolverr returned `status != "ok"`              |
| `no_solution`    | FlareSolverr response contains no `solution` object |

---

### `source` — `@errors/source.errors`

Single class `SourceError(message, code)`.

| Code                    | When used                                                        |
| ----------------------- | ---------------------------------------------------------------- |
| `invalid_response_body` | Torrent metadata response body is neither ArrayBuffer nor string |
| `service_not_found`     | Internal service name not registered in DataResolver             |

`ErrorWithStatus` (in `services/source/services/error-with-status.util.ts`) also extends `AppError` with `type: 'source'` and uses the HTTP status string as the `code`.

---

### `catalog` — `@errors/catalog.errors`

Single class `CatalogError(message, code)`.

| Code             | When used                                           |
| ---------------- | --------------------------------------------------- |
| `user_not_found` | User ID not found when initiating Trakt device auth |

## Adding New Errors

1. Choose the closest existing domain file or create a new one following the same pattern.
2. Add the new code to the `type` union in that file.
3. Throw the typed error — never `new Error(...)`.
4. Update this document.
