# Security

An overview of the backend's protections, with links to the code and to the detailed references. For what a viewer or host can rely on, see [Storage and privacy](../../docs/features/storage-privacy.md).

## Accounts and sessions

Routes require authentication unless they are explicitly public. Access tokens are short-lived JWTs bound to a session; refresh tokens are opaque, stored hashed, and rotated. Passwords are hashed with bcrypt (`Bun.password`). Roles are `user` and `admin`; administrators create accounts. See [Authentication](authentication.md).

Logins are limited per address by the rate limiter and per account by [`login-throttle.ts`](../src/services/auth/login-throttle.ts), which keeps the failure count in memory: after too many failures in a window the account refuses logins, even with the right password, until the window ends.

## Rate limiting

[`rate-limit.middleware.ts`](../src/middleware/rate-limit.middleware.ts) limits each route per client address (an IPv6 client per /64). The numbers passed to `rateLimitGuard` are requests per second. Memory stays bounded: once the table is full, new addresses share one overflow limiter per route. Limited requests are recorded in the audit log, at most once per address and route while they stay over the limit.

The client address comes from [`getRealClientIp`](../src/utils/proxy.util.ts), which trusts `X-Forwarded-For` only from a proxy that presents `REVERSE_PROXY_SECRET`. See [Reverse proxy](reverse-proxy.md).

## Browser protections

- [Security headers](../src/middleware/security-headers.middleware.ts) on every response, including a Content Security Policy written for the served web app (inline scripts allowed by hash). HSTS is left to the TLS terminator (Caddy in the supplied HTTPS setup).
- [CORS](../src/middleware/cors.middleware.ts) for the configured browser origins with credentials, and for the Samsung TV app's local origin without credentials.
- Session cookies are HttpOnly and `SameSite=Strict`; see [Authentication](authentication.md#browser-transport).

## Data at rest

Text columns that would reveal what is stored or watched (file paths, probe output, searches, notification titles) are encrypted with AES-GCM and use column names that don't describe them ([`encrypted-column.util.ts`](../src/utils/encrypted-column.util.ts), [`EncryptionService`](../src/services/encryption/encryption.service.ts)). Columns used for lookups and unique constraints are encrypted deterministically. Downloaded media is encrypted by the media-load service; see [Encrypted chunk storage](../../services/media-load/docs/chunk-stores.md).

## VPN check

Every service that reaches indexers, trackers or peers (the sources and media-load services) runs its own check with [`@miauflix/vpn-guard`](../../packages/vpn-guard/src/vpn-guard.ts). It asks NordVPN's IP insights whether the service's outbound connection is protected, or matches it against `<PREFIX>_KNOWN_VPN_IPS` for other VPNs. A protected result is trusted for five minutes; a failure counts as unprotected and is retried after 30 seconds. While unprotected, the sources service blocks searches and the media-load service fences its engine (no peers, announces, or new torrents).

`DISABLE_VPN_CHECK` in the backend's [VPN configuration](../src/services/security/vpn.configuration.ts) is the deployment-wide default; each service's `<PREFIX>_DISABLE_VPN_CHECK` overrides it. The backend itself does not check, and nothing inspects users' connections. For running the services behind a VPN, see [Using a VPN](../../docs/setup/docker-setup.md#using-a-vpn).

## Audit log and cleanup

Security events and API access are recorded in the audit log; see [Security logging](security-logging.md). A daily [cleanup job](../src/services/security/security-cleanup.ts) deletes audit logs past their retention, expired QR login requests, refresh tokens and streaming keys.

## Deployment checklist

1. Serve over HTTPS and set `COOKIE_SECURE=true` (the supplied HTTPS setup does both).
2. Keep `.env` and the data directory private; they hold the JWT and source security keys.
3. Set `REVERSE_PROXY_SECRET` when behind a proxy, and never expose it to clients.
4. Keep the VPN check enabled for the sources and media-load services unless they already route through a VPN you trust.
