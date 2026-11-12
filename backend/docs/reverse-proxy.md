# Reverse Proxy Configuration

How the backend finds the client's IP address when it runs behind a reverse proxy.

## Problem

Behind a reverse proxy every request comes from the proxy's address. Rate limiting, the audit log and QR login records need the client's address instead, and that address is only available in the `X-Forwarded-For` header, which any client can also send.

## Solution

The proxy and the backend share a secret, `REVERSE_PROXY_SECRET`:

1. The proxy sends it on every request in the `X-Reverse-Proxy-Secret` header.
2. The backend trusts `X-Forwarded-For` only when that header matches, and then uses its leftmost address.
3. Otherwise (no secret configured, or a missing or wrong header) it uses the address of the direct connection.

The logic is in [`proxy.util.ts`](../src/utils/proxy.util.ts) (`getRealClientIp`).

## Configuration

The supplied HTTPS setup ([`docker-compose.https.yml`](../../docker-compose.https.yml) with the [`Caddyfile`](../../Caddyfile)) already does this: set `REVERSE_PROXY_SECRET` in `.env` and both Caddy and the backend receive it. See [HTTPS with a domain](../../docs/setup/docker-setup.md#https-with-a-domain).

Generate a value with `openssl rand -hex 32`, or let [`scripts/generate-proxy-secret.sh`](../../scripts/generate-proxy-secret.sh) add one to `.env`.

With another proxy, send the same header, for example in Caddy:

```caddyfile
reverse_proxy miauflix:3000 {
	header_up X-Reverse-Proxy-Secret {$REVERSE_PROXY_SECRET}
}
```

## Troubleshooting

If logs or rate limits show the proxy's address (in Docker, often an IPv6-mapped private address such as `::ffff:172.18.0.3`), check that:

1. `REVERSE_PROXY_SECRET` reaches both the proxy and the backend container, with the same value.
2. The proxy sends the `X-Reverse-Proxy-Secret` header and an `X-Forwarded-For` header.

## Security Considerations

- Use a long random secret, and change it if it may have leaked; restart both containers afterwards.
- Anyone who knows the secret can choose the address the backend records, so never put it in client-side configuration.
