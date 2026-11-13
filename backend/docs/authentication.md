# Authentication system

Miauflix authenticates its own accounts with passwords or an approved QR login. API access uses JWTs; opaque refresh tokens renew sessions. Browsers and the installed Samsung TV app use different token transports. Trakt account linking is a separate integration and never authenticates a Miauflix account.

For available account controls and planned UI, see [Accounts and your personal collection](../../docs/features/accounts.md). The implementation is in [auth routes](../src/routes/auth.routes.ts), [AuthService](../src/services/auth/auth.service.ts), and [auth middleware](../src/middleware/auth.middleware.ts).

## Tokens and sessions

- Access tokens are signed with HS256 and include user identity, role and their session (`sid`). Their default lifetime is 15 minutes. A token is only accepted for the session it names (`X-Session-Id`, or the realtime `authenticate` message's `session`), and only while that session's refresh token still exists: every authenticated request checks it (cached for five seconds, cleared at once when this server revokes the session). The role used is the account's current one, not the one in the token. Tokens without `sid` (issued before this check) are refused, and clients refresh.
- Refresh tokens are random 256-bit opaque values. The database stores token hashes, with one active token row per session. Their default lifetime is seven days, with a default maximum chain age of 30 days.
- Each successful login creates a fresh, random session identifier. It is not a deterministic device fingerprint and does not reuse a fixed user/device session ID.
- The session-slot limit is configurable. When a login reaches the limit, the oldest refresh-token record by last access is removed to make room.
- API middleware requires `X-Session-Id` to select the request's session and access token. A Bearer token alone does not establish the middleware's session context.

Defaults and configuration names are defined in [auth configuration](../src/services/auth/auth.configuration.ts). Passwords are hashed with bcrypt (`Bun.password`); account roles are `user` and `admin`.

## Browser transport

Normal browser login, first-run setup, QR claim, and token refresh set **both access and refresh tokens as HttpOnly cookies**. The browser response does not return a top-level `accessToken` or `refreshToken` field.

| Cookie  | Default name              | Path         | Use                                    |
| ------- | ------------------------- | ------------ | -------------------------------------- |
| Access  | `__miauflix_at_<session>` | `/`          | Authenticated application requests     |
| Refresh | `__miauflix_rt_<session>` | `/api/auth/` | Refresh, logout, and session discovery |

Both cookies use `SameSite=Strict`. `COOKIE_SECURE` controls the `Secure` attribute and defaults to `false`; the supplied HTTPS deployment enables it. `COOKIE_DOMAIN` is optional. Enabling `COOKIE_SECURE` does **not** automatically add a `__Secure-` prefix to cookie names.

The browser sends credentials and `X-Session-Id` for protected requests. Middleware first looks for the selected session's access cookie, then falls back to `Authorization: Bearer`. JavaScript does not read the browser's HttpOnly tokens.

Example of the browser request sequence:

```javascript
const login = await fetch('/api/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const { session, user } = await login.json();

const current = await fetch('/api/auth/session', {
  credentials: 'include',
  headers: { 'X-Session-Id': session },
});
```

The example assumes successful responses; application clients must handle errors and expired access tokens. See [authenticated requests](../../frontend/src/shared/api/authenticated-request.ts) for the existing refresh-and-retry behavior.

## Installed TV token transport

The Tizen app runs from local files and cannot rely on the backend's browser cookies. It sets `X-Auth-Transport: token` on authentication requests. Successful login/setup/QR-claim responses then include:

```typescript
{
  session: string;
  user: UserDto;
  tokens: {
    accessToken: string;
    refreshToken: string;
  }
}
```

Refresh responses include `{ user, tokens }` and use the session already named in the request path. Ordinary browser responses omit `tokens`.

A request that carries any session cookie (`<REFRESH_TOKEN_COOKIE_NAME>_*` or `<ACCESS_TOKEN_COOKIE_NAME>_*`) never gets `tokens`, even with `X-Auth-Transport: token`: the backend sets cookies instead. Otherwise script on the web app's page could trade the HttpOnly refresh cookie for a readable refresh token.

| Request             | Headers used by the TV client                            |
| ------------------- | -------------------------------------------------------- |
| Protected API       | `X-Session-Id` and `Authorization: Bearer <accessToken>` |
| Refresh or logout   | `X-Refresh-Token: <refreshToken>`; session is in the URL |
| Session discovery   | `X-Refresh-Tokens: <session>:<token>,<session>:<token>`  |
| Auth token delivery | `X-Auth-Transport: token`                                |

The TV client keeps access tokens in memory and refresh tokens in the installed app's local storage. It omits browser credentials and updates stored tokens after successful renewal. This is the TV-specific transport, not an optional session-storage mode for ordinary browsers.

Implementation: [transport readers](../src/utils/auth-transport.util.ts), [TV auth fetch](../../frontend/src/shared/api/tv-auth.ts), and [frontend backend client](../../frontend/src/shared/api/backend-client.ts).

## Authentication API

All routes below are mounted under `/api/auth`. `UserDto` contains `id`, `email`, nullable `displayName`, `role`, `avatar` (the profile's Plushie look; generated with the editor's Surprise me generator when an account is created without one, and for older accounts by a data migration, so it is only `null` for a record the migration has not reached yet) and nullable `avatarVersion` (changes when a new avatar picture is saved; `null` when there is none, or after a look change until its new picture is saved).

| Method and path          | Authentication/input                                                                                              | Successful behavior                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /setup`             | No existing session required                                                                                      | Returns `{ available }` for first-admin setup                                                                                                            |
| `POST /setup`            | `{ email, password }`; password minimum eight characters                                                          | Creates the initial admin only while setup is available, then returns login data                                                                         |
| `POST /login`            | `{ email, password }`; 429 with `Retry-After` after 10 failures in 15 minutes                                     | Returns `{ session, user }` and delivers tokens using the selected transport                                                                             |
| `POST /refresh/:session` | Session refresh cookie or `X-Refresh-Token`                                                                       | Rotates refresh token, issues a new access token, returns `{ user }` plus TV tokens when requested                                                       |
| `POST /logout/:session`  | Session refresh cookie or `X-Refresh-Token`                                                                       | Revokes that refresh session, clears both browser cookies, returns `{ message }`                                                                         |
| `GET /sessions`          | Refresh cookies or `X-Refresh-Tokens`                                                                             | Returns valid presented sessions as `{ session, user }[]`                                                                                                |
| `GET /session`           | Valid access token and `X-Session-Id`                                                                             | Returns `{ id: sessionId, user }`                                                                                                                        |
| `POST /users`            | Admin access token/session; `{ email, password, role, displayName?, avatar? }`, password minimum eight characters | Creates a `user` or `admin` account and returns its user data; 409 when the email is taken                                                               |
| `PATCH /session/profile` | Valid access token and `X-Session-Id`; `{ displayName?, avatar? }`                                                | Updates the session's own profile name and look (a look can be replaced, not removed: `null` is a 400) and returns its user data                         |
| `PUT /session/avatar`    | Valid access token and `X-Session-Id`; `image/png` body, at most 1 MB                                             | Stores the profile's pre-rendered avatar picture (`DATA_DIR/avatars/<userId>.png`)                                                                       |
| `GET /avatars/:userId`   | Valid access token and `X-Session-Id`                                                                             | Returns a profile's avatar picture, or 404 when it has none. With `?v=<avatarVersion>` it may be cached for good; without it the browser must revalidate |

The refresh route performs token rotation. Use `/session` to validate the access token or `/sessions` to discover the refresh sessions presented by the client. Session discovery checks at most eight presented tokens (one per profile on a shared TV), rather than listing every device ever used by the account.

Authentication routes have endpoint-specific rate limits. User creation is guarded by the administrator role; refresh, logout, and session discovery validate their presented refresh credentials rather than requiring a current access JWT.

Logout revokes the refresh session and removes browser cookies. Access tokens of that session stop working with it (see Tokens and sessions), and realtime sockets of the session are closed (`1008 Session ended`). Sockets also recheck their session every minute, which catches revocations made by another server process and follows role changes.

Login is also limited per account: after 10 failed attempts within 15 minutes (counted from the first), the account refuses logins, even with the right password, until those 15 minutes are over. A successful login clears the count. This is kept in memory, on top of the per-IP limit of one attempt per second. An unknown email costs the same bcrypt check as a wrong password, so response times do not tell which accounts exist. Every request body under `/api` is capped at 256 KiB, except the avatar upload (1 MB).

## QR login

QR login lets a signed-in account approve a new device without entering its password on that device:

1. The new device calls `POST /api/auth/qr`. The response contains `requestId`, `claimToken`, `approvalPath`, `expiresAt`, and `pollInterval`.
2. The QR code points to the frontend approval path `/auth/qr/:approvalToken`. The approval device reads request information through `GET /api/auth/qr/:approvalToken`.
3. A signed-in user calls `POST /api/auth/qr/:approvalToken/approve` or `/reject`. Both actions require normal API authentication.
4. The new device polls `POST /api/auth/qr/:requestId/claim` with `{ claimToken }`. While no claim can be completed it returns a pending response; a successful claim returns login data and delivers tokens.

Approval and claim use different random secrets. Requests expire after five minutes. Claiming uses a lease and completion step so competing claims do not create multiple usable sessions; failed completion revokes the newly generated refresh session.

Implementation: [QR service](../src/services/auth/qr-login.service.ts) and [QR routes](../src/routes/auth.routes.ts).

## Refresh rotation and lifetime

The refresh repository locates the session and verifies the presented token against its stored hash. Successful renewal replaces that hash through a conditional update that matches the old hash, user, and session. A stale or competing update cannot replace the new token and is treated as a failed renewal.

The session also keeps the hash of its previous token and when it was rotated. When that previous token is presented again more than 30 seconds after the rotation, it can only be a copy (whoever rotated it holds the session now), so the session is revoked for both holders and a critical audit event is recorded. Within those 30 seconds it is only refused, since two tabs refreshing at once look the same.

Refresh lifetime and chain age are different limits. Renewal moves the token's expiry forward but does not reset the original session creation time used for the maximum chain age. Expired sessions are rejected. Token rotation and suspicious renewal behavior are recorded through the security audit service.

Implementation: [refresh-token repository](../src/repositories/refresh-token.repository.ts) and [AuthService](../src/services/auth/auth.service.ts).

## Protecting application routes

Use the existing Hono middleware rather than duplicating role checks:

```typescript
import { UserRole } from '@entities/user.entity';
import { authGuard } from '@middleware/auth.middleware';

app.get('/secure', authGuard(), c => {
  const { user } = c.get('sessionInfo');
  return c.json({ email: user.email });
});

app.get('/admin', authGuard(UserRole.ADMIN), c => c.json({ ok: true }));
```

The application must have its authentication middleware installed before these guards. The middleware extracts and verifies a JWT; `authGuard()` requires its session context, and `authGuard(UserRole.ADMIN)` additionally requires the exact role.

## Configuration

These are the current authentication setting names and defaults, rather than a requirement to hand-edit secrets:

| Setting                          | Default/purpose                                    |
| -------------------------------- | -------------------------------------------------- |
| `JWT_SECRET`                     | Generated signing secret                           |
| `ACCESS_TOKEN_EXPIRATION`        | `15m`                                              |
| `REFRESH_TOKEN_EXPIRATION`       | `7d`                                               |
| `REFRESH_TOKEN_MAX_REFRESH_DAYS` | `30`                                               |
| `MAX_DEVICE_SLOTS_PER_USER`      | `5`                                                |
| `ACCESS_TOKEN_COOKIE_NAME`       | `__miauflix_at`                                    |
| `REFRESH_TOKEN_COOKIE_NAME`      | `__miauflix_rt`                                    |
| `COOKIE_SECURE`                  | `false`; enabled for the supplied HTTPS deployment |
| `COOKIE_DOMAIN`                  | Optional cookie domain                             |

Generated secrets are persisted by the configuration system so they survive restarts. Preserve the server's persistent data and keys. See [configuration bootstrap](../src/services/configuration/configuration.service.ts) and [HTTPS deployment](../../docker-compose.https.yml).

Streaming uses separate settings and credentials, including `STREAM_TOKEN_EXPIRATION`. Video access is not authenticated by putting an ordinary API JWT in the stream URL. See [Streaming Services](streaming-services.md) and the [stream route](../src/routes/stream.routes.ts).

## Current UI boundaries

The application has password login, QR login, and first-admin setup. Each session the device holds is a profile: Who's watching picks the current one (kept in `sessionStorage` for the app run), signing in adds a profile without switching to it, and Logout in Home's profile panel removes the watching one by logging out its session. Administrators add profiles from Who's watching.

For frontend behavior, consult [auth API](../../frontend/src/features/auth/api/auth.api.ts) and [auth state](../../frontend/src/store/slices/auth.ts).
