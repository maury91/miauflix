# To do

## TV source support

See [TV source support plan](docs/architecture/tv-source-support-plan.md).

- [ ] Support multi-episode video releases correctly (for example, two broadcast episodes in one file). Exact single-episode sources remain preferred and combined videos remain a last resort. Resolve catalog numbering, episode boundaries, resume/progress attribution, and subtitle timing before treating a combined file as episode-accurate; never split its duration evenly.
- [ ] Evaluate bounded credits-tail analysis and mid/post-credit story-scene detection. Current playback uses named end-credit chapters when present and otherwise the final-90-second countdown; validate any detector against offline fixtures before enabling automatic transitions.
- [ ] Add end-to-end coverage for shared-pack playback and subtitles, late episode reattachment, competing watchlist capacity, notification focus behavior, and next-episode countdown cancellation.
