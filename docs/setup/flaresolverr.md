# FlareSolverr setup

FlareSolverr is an optional helper for source websites that present browser challenges. Miauflix's source-search service can ask it to fetch a protected page. It is not needed for every provider and does not guarantee access to every protected website.

## Where it fits

Source website access belongs to the standalone Sources service. Its HTTP client uses FlareSolverr when a definition requires it, or when a response is a `403` or `503` containing a recognized Cloudflare challenge marker. A generic `403` alone does not trigger a retry.

The Sources configuration field `FLARESOLVERR_URL` controls this behavior. An empty URL disables it, and providers that require it are skipped until it is configured.

## Docker setup

Add [docker-compose.flaresolverr.yml](../../docker-compose.flaresolverr.yml) to the files listed in your deployment's `.env`:

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.flaresolverr.yml
```

Keep any other overlays you use, such as VPN or HTTPS, in that list. For example:

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.vpn.yml:docker-compose.flaresolverr.yml
```

Start or update the stack:

```bash
docker compose up -d
```

The overlay starts the `flaresolverr` container defined in the base Compose file. Configure the Sources group's `FLARESOLVERR_URL` from the administrator's Configuration screen, using the address that the source service can reach:

| Deployment                                          | Address                    |
| --------------------------------------------------- | -------------------------- |
| Base Docker network                                 | `http://flaresolverr:8191` |
| Shared VPN network                                  | `http://127.0.0.1:8191`    |
| Both services running directly on the same computer | `http://localhost:8191`    |

The default Compose environment also supplies a bootstrap URL. Saved settings determine the effective value shown in the configuration screen. `FLARESOLVERR_URL` is the Sources service's enable/disable control.

When building from a checkout, include `docker-compose.build.yml` as well. See [Combining Compose files](docker-setup.md#combining-compose-files).

## Running the helper separately

You can run the helper outside the Miauflix Compose stack. For example, to expose it only on this computer:

```bash
docker run -d \
  --name flaresolverr \
  -p 127.0.0.1:8191:8191 \
  -e LOG_LEVEL=info \
  -e LOG_HTML=false \
  -e CAPTCHA_SOLVER=none \
  ghcr.io/flaresolverr/flaresolverr:v3.5.2
```

Then set the Sources configuration URL to an address reachable from the Sources service. `localhost` inside a container means that container, not the host or another container.

If source requests must travel through a VPN, the helper needs the same routing protection. The supplied VPN overlay places the helper in the shared VPN network.

## How requests are handled

1. The source service performs its normal VPN, timeout, and response-size checks.
2. A definition requirement or recognized challenge can trigger a request to FlareSolverr's `/v1` endpoint.
3. The client uses the returned page content, status, and headers as the source response.
4. A failed challenge, oversized response, or timeout remains an error; it is not treated as a successful source search.

The current client does not extract solver cookies into a persistent per-domain cookie jar. Avoid assuming every subsequent request will bypass the helper or meet a particular latency target.

## Troubleshooting

### The helper cannot be reached

Check that its container is running and inspect its logs:

```bash
docker compose ps flaresolverr
docker compose logs --tail=100 flaresolverr
```

Check the saved Sources URL and the network shared by the source service and helper. With the VPN overlay, use the loopback address shown above. Without it, use the Docker service name.

### A provider is skipped or still fails

A provider marked as requiring FlareSolverr needs a non-empty Sources URL. Even with a reachable helper, a website can change its challenge, reject the request, or be unavailable. Check the source-provider test in Settings → Sources and inspect both source-service and helper logs.

FlareSolverr does not make unsupported Cardigann definitions or private-tracker sign-in flows supported. See [Source features and limits](../features/sources.md).

### Searches are slower

Fetching a page through a browser helper can take longer than a direct request. Miauflix bounds requests with timeouts and response-size limits; it does not promise a fixed search time. A slow or failing provider may also enter a cooldown.

## Implementation and related guides

- [Source HTTP client](../../services/sources/src/http/http-client.ts)
- [Search planning and required-helper checks](../../services/sources/src/planner/planner.ts)
- [Sources configuration schema](../../services/sources/src/config/schema.ts)
- [Docker helper overlay](../../docker-compose.flaresolverr.yml)
- [Docker setup](docker-setup.md)
- [Environment settings](environment-variables.md)
