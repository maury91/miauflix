# TV pairing service

Hands a Miauflix server's address to a Samsung TV app that can't find it on its own. It is
hosted for everyone at `https://pair.miauflix.cat`; it is **not** part of a Miauflix install.
Run your own and point both sides at it (`TV_PAIRING_URL` on the server,
`npm run package:tizen -- --pairing-url <origin>` for the TV app) to keep away from the hosted one.

## How pairing works

1. The TV creates a pairing and shows its code, keeping the secret:
   `POST /v1/pairings` → `201 { code, secret, expiresAt, pollInterval }`.
2. Someone signed in to their server enters the code in **Settings → Pair a TV**; the server
   stores the address the TV should use: `PUT /v1/pairings/:code` with `{ "url": "http://192.168.1.10:3000" }`
   (an `http(s)` origin, optional `name`) → `204`, `404` unknown or expired, `409` already used.
3. The TV polls with its secret: `GET /v1/pairings/:code` with `Authorization: Bearer <secret>`
   → `202 { status: "pending" }`, then `200 { status: "paired", server: { url, name? } }` once,
   which deletes the pairing. A wrong secret gets the same `404` as an unknown code.

Codes are 8 symbols from 32 (no `0`/`O`, `1`/`I`), so 2^40 of them, and expire after 10 minutes.
Spaces, dashes and lower case are ignored. Each client IP may create 10 pairings, try 10 codes and
poll 120 times a minute (`429` beyond); at most 10,000 pairings are open at once (`503`). Pairings
live in memory only: a restart drops the open ones, and nothing is kept once the TV has its
address. CORS allows any origin without credentials (the TV app runs from local files).

`GET /health` → `{ "status": "ok" }`.

## Run it

```bash
docker run -d -p 3003:3003 ghcr.io/maury91/miauflix-tv-pairing:latest
```

A standalone Bun service, not one of the Miauflix workspaces: it has no dependencies and shares no code with Miauflix. From a checkout: `cd tv-pairing && bun run src/index.ts`; tests: `bun test`; types: `npx tsc --noEmit`.

| Variable                      | Default   | Meaning                                                                                                                                                                    |
| ----------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TV_PAIRING_PORT`             | `3003`    | Port to listen on                                                                                                                                                          |
| `TV_PAIRING_HOST`             | `0.0.0.0` | Address to listen on                                                                                                                                                       |
| `TV_PAIRING_TTL_SECONDS`      | `600`     | How long a code is valid                                                                                                                                                   |
| `TV_PAIRING_CLIENT_IP_HEADER` | unset     | Header a reverse proxy puts the client IP in (`cf-connecting-ip`, `x-real-ip`, `x-forwarded-for`: last entry), for the rate limits. Only behind a proxy that overwrites it |

Serve it over HTTPS (a reverse proxy in front): the TV gets the server's address from it.
