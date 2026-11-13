# Security logging

The audit log records security events and API access in the backend's SQLite database (`audit_logs`). It helps answer who signed in, from where, and what was refused. Nothing in the application shows it yet; read it from the database.

## What is recorded

[`AuditLogMiddleware`](../src/middleware/audit-log.middleware.ts) records every API request except `/api/health` as `API_ACCESS`, then an `UNAUTHORIZED_ACCESS` row for authentication and role errors or an `API_ERROR` row for other errors. The routes and services add specific events through [`AuditLogService`](../src/services/security/audit-log.service.ts): login attempts (`LOGIN`, `LOGIN_FAILURE`), token refresh, token invalidation on logout, suspicious activity, and `RATE_LIMIT_EXCEEDED` from the [rate limiter](../src/middleware/rate-limit.middleware.ts).

The event types and severities (`INFO`, `WARNING`, `ERROR`, `CRITICAL`) are defined in [`audit-log.entity.ts`](../src/entities/audit-log.entity.ts). Some types, such as `PASSWORD_RESET_REQUEST` or `IP_BLOCKED`, are defined but not emitted by any feature yet.

## Columns

| Column        | Content                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| `id`          | UUID                                                                              |
| `eventType`   | One of `AuditEventType`                                                           |
| `severity`    | One of `AuditEventSeverity`, `INFO` by default                                    |
| `description` | Short text, at most 500 characters; request paths are redacted                    |
| `ipAddress`   | Client address from [`getRealClientIp`](../src/utils/proxy.util.ts), or `unknown` |
| `userAgent`   | The request's `User-Agent`                                                        |
| `metadata`    | JSON: method, redacted query and headers, path, and event-specific details        |
| `userEmail`   | The account involved, when known                                                  |
| `createdAt`   | When the event happened (not when its batch was written)                          |

Indexes: `createdAt`, and `(eventType, createdAt)` for retention.

## Writing

`logSecurityEvent` queues the row and returns; rows are written in batches shortly after, so a request never waits on the database. A failed batch is retried, then dropped and counted as lost. On shutdown `close()` writes what is queued and reports how many events were never written. Tokens, cookies, and other secrets in headers, query strings and paths are redacted before they are stored ([`redact.util.ts`](../src/utils/redact.util.ts)).

## Retention

The daily [security cleanup](../src/services/security/security-cleanup.ts) calls `cleanupOldLogs`: `API_ACCESS` rows are kept for 14 days, every other event for 90 days (`AUDIT_RETENTION_DAYS`).

## Reading

`AuditLogService` offers `getRecentLogs`, `getUserLogs` (by email), `getLogsByEventType` and `getLogsBySeverity` for tooling; no API route exposes them.
