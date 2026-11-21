# To do

## TV source support

See [TV source support plan](docs/architecture/tv-source-support.md).

- [ ] Support episode-accurate playback of multi-episode video releases (for example, two broadcast episodes in one file).
  - [x] Prefer exact single-episode sources, with combined files as a last resort.
  - [x] Mark combined matches in playback sessions and suppress the timed next-episode countdown for them.
  - [ ] Map each segment in a combined file to its catalog episode and resolve its actual boundaries without dividing the duration evenly.
  - [ ] Attribute resume and viewing progress to the correct episode and align its subtitles to the segment.
- [ ] Evaluate bounded credits-tail analysis and mid/post-credit story-scene detection.
  - [x] Recognize named end-credit chapters, including anime ED/Ending, and skip to a chapter-marked scene after the credits when available.
  - [x] Use the final-90-second next-episode countdown when chapter timing is unavailable.
  - [ ] Evaluate bounded credits-tail and mid/post-credit scene detection on offline fixtures before enabling detector-driven transitions.
- [ ] Add end-to-end coverage for TV source and playback flows.
  - [x] Cover notification keyboard focus in a Storybook browser test.
  - [x] Cover next-episode countdown cancellation in a player unit test.
  - [ ] Add end-to-end tests for shared-pack playback and subtitles, late episode reattachment, and watchlist items competing for storage capacity.
  - [ ] Cover notification focus and next-episode countdown cancellation in the full app flow.

## Details page

- [ ] Add trailers
  - [x] Store movie trailer codes when a source provider supplies them.
  - [ ] Expose trailer availability on the details page and let users play the trailer.
- [x] Change to icon buttons with tooltips
- [ ] Add "You may also like" section

## Player

- [ ] Debounce seek in TV player
- [ ] When seeking pause the video
- [ ] When seeking show thumbnails above the progress bar

## Storage page

- [x] Redesign the page

## Sources

- [ ] Extend the Watch Now button to have a quality selector for users that want to choose the quality
- [ ] Update the source quality pill to show the highest quality available
  - [x] Show the selected source's resolution and release type when available.
  - [ ] Show the highest available quality even when playback selects a different source.

## Account

- [x] Admins can create new accounts from the UI
- [x] Profile editor
- [x] Support for [plushies](https://github.com/prathje/plushies)
- [x] Profile selector
- [x] Logout

## VPN

- [ ] Add Settings controls for VPN tunnel diagnostics and country or exit-node selection.
  - [x] Use Gluetun health for VPN protection checks and support country selection through Docker configuration.
  - [ ] Connect Settings to Gluetun's control server at `127.0.0.1:8000` using `/v1/vpn/status` and `/v1/publicip/ip`. Configure write access in `/gluetun/auth/config.toml` for changing country or exit node.
  - [ ] Measure VPN IP-check latency and failure rate and run a small download test through the tunnel, independently of torrent performance.

## Storage privacy

See [Downloads, storage, and privacy](docs/features/storage-privacy.md#planned-external-database).

- [ ] Optional external database (for example AWS RDS PostgreSQL) for everything that links downloads to torrents: media-load's records (layouts with their per-download salts, source descriptors) and the backend's sources table. The server then keeps only the master key and unreadable files.
- [ ] Encrypt what is stored there with the server's master key, so a dump of the external database is unreadable on its own.
  - [x] Encrypt sensitive download layouts and source descriptors in local storage with the server's master key.
  - [ ] Protect sensitive data in the external database, including exact file geometry that is currently stored in plaintext.
- [ ] Optional locked boot: the master key is stored encrypted and unlocked by a passphrase given at startup (command line or UI), so a stopped server's disk holds nothing usable.
- [ ] Re-encrypt downloads from before per-download keys, or offer to delete them.
  - [x] Continue reading legacy downloads and allow admins to remove individual inactive downloads from Storage.
  - [ ] Re-encrypt legacy downloads or identify them in the UI and offer targeted deletion.
- [ ] Redact source identifiers in media-load's crash output.
  - [x] Redact info hashes and magnet links in messages written through the media-load logger.
  - [ ] Redact fatal errors and unhandled rejections that bypass the logger.

## Language

- [x] Add support for i18n
  - [x] Support localized catalog metadata and genres in the catalog service.
  - [x] Localize interface strings.
  - [x] Request catalog metadata in the profile's interface language.
  - [ ] Localize search results and season and episode details (their routes take no language yet).
- [x] Translate into Italian
- [ ] Translate into Lithuanian
- [x] Allow users to choose a language for the interface (and default language for subs and audio)
  - [x] Use browser language preferences for audio selection and subtitle search defaults.
  - [x] Let users set their own interface, subtitle, and audio language defaults.
- [ ] Allow users to choose if they want subs auto-enabled and which language
  - [x] Remember per-title subtitle language and track selection, including subtitles turned off.
  - [ ] Add a user-wide setting for automatic subtitle enablement and its language.

## Auto-translation

- [ ] Add support for translating subtitles with the use of LLMs

## Language learning

- [ ] Add support for partial translation of subtitles (translate everything except few words so the user has to learn them (or the opposite in case the target translation is the language the user wants to learn))

## UI

- [x] Use the same input elements everywhere ( like in the admin setup page )
