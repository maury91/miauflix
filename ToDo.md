# To do

## TV source support

See [TV source support plan](docs/architecture/tv-source-support-plan.md).

- [ ] Support multi-episode video releases correctly (for example, two broadcast episodes in one file). Exact single-episode sources remain preferred and combined videos remain a last resort. Resolve catalog numbering, episode boundaries, resume/progress attribution, and subtitle timing before treating a combined file as episode-accurate; never split its duration evenly.
- [ ] Evaluate bounded credits-tail analysis and mid/post-credit story-scene detection. Current playback uses named end-credit chapters when present and otherwise the final-90-second countdown; validate any detector against offline fixtures before enabling automatic transitions.
- [ ] Add end-to-end coverage for shared-pack playback and subtitles, late episode reattachment, competing watchlist capacity, notification focus behavior, and next-episode countdown cancellation.

## VPN

- [ ] Add an option in settings (gluetun service) to check the VPN tunnel's bandwidth, and to choose the country or exit node. Miauflix shares gluetun's network, so it can reach gluetun's control server at `127.0.0.1:8000` (`/v1/vpn/status`, `/v1/publicip/ip`; changing settings needs an entry in gluetun's `/gluetun/auth/config.toml`). Measure the tunnel apart from the torrents: latency and failure rate of the VPN IP checks plus a small download test, so a bad exit server can be told apart from a weak swarm.
