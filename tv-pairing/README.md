# TV pairing service

Lets the Miauflix Samsung TV app find the Miauflix servers on its network. It is hosted for
everyone at `https://pair.miauflix.cat`; it is **not** part of a Miauflix install. Run your own
and point both sides at it (`TV_PAIRING_URL` on the server,
`npm run package:tizen -- --pairing-url <origin>` for the TV app) to keep away from the hosted one.

## How it works

One endpoint, `POST /v1/discovery`, with a JSON body:

- **A server announces itself**: `{ "role": "server", "id": "…", "urls": ["http://192.168.1.10:3000"], "name": "…" }`
  → `200 { "announceInterval": 120 }`. `id` (8 to 64 letters, digits, `_`, `-`) identifies the
  server, so a new announcement replaces its previous one; `urls` are 1 to 8 `http(s)` origins the
  server can be reached at on its network; `name` is optional. Servers announce again every
  `announceInterval` seconds.
- **A TV looks servers up**: `{ "role": "client" }` → `200 { "servers": [{ "id", "urls", "name"?, "lastSeen" }] }`,
  latest first. The TV probes the addresses and lists the servers that answer.

Servers and TVs are matched by the public IP the requests come from: behind the same router, they
share it. An IPv6 client is matched by its /64. A server and a TV that reach the service over
different IP versions don't match, so serve it over IPv4 only (an `A` record, no `AAAA`) unless
every network you care about is IPv6 end to end.

An announcement is dropped 5 minutes after it was made. At most 16 servers are kept per network
(the one silent the longest goes first) and 100,000 networks at once (`503` beyond); each network
may send 30 requests a minute (`429` beyond). Everything lives in memory: a restart forgets every
server until it announces again, within two minutes. CORS allows any origin without credentials
(the TV app runs from local files).

Anyone behind the same public IP can announce a server, or read the announced addresses: that
includes the other customers of a carrier-grade NAT. The addresses are private ones, and the TV
only lists the servers that answer as Miauflix servers.

`GET /health` → `{ "status": "ok" }`.

## Run it

```bash
docker run -d -p 3003:3003 ghcr.io/maury91/miauflix-tv-pairing:latest
```

A standalone Bun service, not one of the Miauflix workspaces: it has no dependencies and shares no
code with Miauflix. From a checkout: `cd tv-pairing && bun run src/index.ts`; tests: `bun test`;
types: `npx tsc --noEmit`.

| Variable                      | Default   | Meaning                                                                                                                                                                                                           |
| ----------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TV_PAIRING_PORT`             | `3003`    | Port to listen on                                                                                                                                                                                                 |
| `TV_PAIRING_HOST`             | `0.0.0.0` | Address to listen on                                                                                                                                                                                              |
| `TV_PAIRING_TTL_SECONDS`      | `300`     | How long an announcement counts                                                                                                                                                                                   |
| `TV_PAIRING_CLIENT_IP_HEADER` | unset     | Header a reverse proxy puts the client IP in (`cf-connecting-ip`, `x-real-ip`, `x-forwarded-for`: last entry). Required behind a proxy, or every client shares its IP; only behind one that overwrites the header |

Serve it over HTTPS (a reverse proxy in front).
