# Miauwatch Changelog

Release notes for viewers and self-hosters. See the [detailed changelog](DETAILED_CHANGELOG.md) for implementation and upgrade notes.

## Unreleased

- Miauflix is now Miauwatch, with a new wordmark and icon for the web and Samsung TV apps. Existing installs can upgrade in place.

### Languages

- Miauwatch is now available in Italian and Lithuanian. A new Preferences page in the profile menu sets each profile's interface language, its preferred audio and subtitle languages, and separate audio and subtitle choices for anime. Audio can also be set to the title's original language. Titles, descriptions and genres on Home, in details, in search and in season episode lists follow the interface language.
- Source search also looks for releases under the title's name in every language the server's profiles use (their interface and audio languages), so Italian or Lithuanian releases are found too. Stored titles stay in English, whichever language a profile browses in.
- Releases dubbed or subtitled in Polish, Russian, Ukrainian, Hungarian, Turkish, Hindi, Greek or a Nordic language are now recognized, and more Czech, Slovak, Spanish, Portuguese and Dutch releases are, so they rank after releases in your own language.
- A new Automatic subtitles preference turns on subtitles in your subtitle language when you start a title, unless you changed the subtitles for that title before.
- Under the player's seek bar, up to three buttons switch between your audio language, the original language with subtitles, and your audio language with subtitles.
- A new Audio panel (the headphones button in the player) lists the playing file's audio tracks, each marked Original or Dubbed with its channel layout, and your audio language marked Default. It can also search for sources of the title in another language. Languages the title already has sources in are listed first with their count, and the sources in the chosen language can be played from the panel. The player switches to the chosen source and asks for audio in that language. The audio track moved here from the subtitle panel.
- Notifications about a movie no longer repeat its title.

### App and navigation

- Configuration, Sources, Storage, the Trakt dialog and the page that approves a TV's QR sign-in now match the rest of the app and work with the remote. Back leaves a text field before it leaves the page. Opening a source's settings takes you to its first field, and on a phone each source's buttons sit under its description.
- Storage shows a bar of the server's disk split into movies, episodes, anime, TV copies, free space and, last, other files, with Miauwatch's limit marked. Downloads show their artwork, size, progress and status, and you can sort them by size, name, type, progress or status. Admins can change the storage limit, the space kept free for playback, how long finished downloads keep sharing, and the download folder there; the bar previews a new limit before you save it.
- On settings and profile pages, the page now scrolls under a solid strip behind the logo instead of running through it.
- The player's closed-captions panel is now a side panel over the player, its full height, also in full screen. It lists your default subtitle language first, then languages with tracks, with the rest under More languages. Hearing-impaired subtitles, the subtitle sources (from the video file, from files in the same folder, or online) and the timing each have their own row.
- The server picker, the player's subtitle panel, error and not-found pages, and the quality badge on titles now match the rest of the app. The subtitle panel opens above the controls, with audio, language and tracks as lists you move through with the remote, and Back from subtitle timing returns to the panel first, and Back now works while a slider is selected in a panel or dialog. On a TV, the server picker now scrolls to keep the selected server or field in view when the list is long. Screens no longer generate styles while you use them, which helps the TV.
- Moving through a number setting without changing it no longer rounds its saved value. On a TV, the approve-sign-in page selects Approve as soon as it appears, and copying the Trakt code no longer moves the selection. Closing the Trakt dialog with the keyboard gives control straight back to Home.
- Clicking a text field in settings, the profile editor or search lets you type in it again; before, the field looked selected but ignored the keyboard.

### Self-hosting

- Admins can add Stremio addons that find torrents (Torrentio, Comet, MediaFusion and similar) under Sources → Advanced setup, by pasting the addon's install link. Configure the addon on its own page first: its settings are part of the link, which Miauwatch keeps hidden. Streams from debrid services or direct links are skipped for now. The built-in Torrentio now runs this way too, keeping its options.
- Source search and downloads recognise the VPN setup (gluetun) on their own and trust its kill switch, so they work as soon as its tunnel is up, with any VPN provider gluetun supports, not only NordVPN.

### Playback fixes

- On a movie's page, the bar under Resume watching now shows how much you've watched, like the title's card. It used to show how much of the torrent was prepared, which looked like watch progress; preparation is now written out under the button ("Preparing torrent (65%)"). A movie that never played past its first seconds offers Watch now instead of Resume watching, matching Continue watching.
- Playback no longer starts on a release that nobody is sharing when a shared one exists. Such releases could rank first on picture quality alone, and the title then stayed stuck on its first second and never reached Continue watching.

## 2026-11-20 v0.3.0 Samsung TV playback and a faster Home

### On Samsung TVs

- Home uses WebGL for its rows and hero, reaching about 50 fps on a first pass along a row in our tests. It switches back to the regular renderer if WebGL fails. The hero waits for you to pause on a title before updating its details and backdrop.
- Miauflix builds a TV-friendly copy of downloaded files with audio the TV can't play, such as TrueHD or DTS. It keeps the original picture, one compatible audio track per language and all the subtitles. The player switches over once the copy is ready or at least a minute ahead of where you're watching. The next episode is prepared once it downloads, and deleting the download removes its TV copy.
- TVs that report their codecs can tell Miauflix which releases they can play directly. The player skips releases with unsupported video and looks for a compatible source when audio would otherwise need live conversion. A source with a compatible TV copy ready or in progress keeps its place.
- Closing or reloading the TV app during session renewal keeps you signed in if you reopen it within 30 seconds. Signing out during that window also ends the session on the server.

### App and navigation

- Sign-in and first-time setup work entirely with the remote. Down moves between fields, OK starts typing, and Done on the TV keyboard moves from email to password. A failed sign-in returns focus to the password.
- Home starts on Continue Watching when there's something in progress. Left from the first title in a row opens the sidebar, and Back switches between the sidebar and the rows. Notifications, profile actions and Settings open beside the sidebar. Settings gives admins direct access to Configuration, Storage and Sources, plus the server picker on TV.
- Search shows an on-screen keyboard on TV, with genres and recent searches underneath. Elsewhere you can type straight into the search box and press Down to reach the results. You can remove individual recent searches, and returning from a title puts you back on the result you opened.
- Title details open on the main action. Choosing a season takes you to the next episode to watch, and episode cards show the synopsis and your progress. Watchlist and rating buttons show their labels on focus.
- On Who's Watching, press Down from a profile to edit it directly. The editor follows the remote through the name, appearance options and Fine-tune sliders. OK applies the highlighted option.
- The player puts Play/Pause next to the seek bar. Left and Right seek from that button and while the controls are hidden. Up, Down or OK brings the controls back, and they stay visible while paused or while the subtitles panel is open.
- Home cards use a single image with a larger logo or a title fallback. Rows load when you scroll to them with a mouse or by touch, and the last row scrolls into the same position as the others.
- Continue Watching loads cards in batches so long lists don't hit the server's request limit. Trakt and AniList rows keep showing available titles if a later provider page fails. Trakt lists with mixed entries show movies and shows without gaps where episodes were filtered out.
- Search distinguishes an empty result from a service error and offers Clear search or Try again. Errors on Search, Home and title pages explain what admins can fix or give an error ID to look up in the server logs.

### Playback fixes

- New large downloads can start streaming without checking a whole empty file first.
- Seeking or changing audio tracks during live conversion shows whether Miauflix is waiting for the download or converting it. Resume works when a stream reports its length late, including files with converted audio. Blu-ray H.264 sources with converted audio play on Chrome for Mac, and Samsung TVs stop jumping during live conversion.
- Playback moves on when a source fails before inspection finishes. A source downloading faster than playback needs gets more time to start, and sources that can't fit on disk are skipped. If none fit, the player explains that there isn't enough space.
- Next-episode preparation follows changes to the queued episode. Season-pack progress reflects the selected episode, and background downloads resume after playback releases them.

### Self-hosting and security

- New downloads use a separate encryption key and random disk names. Size padding is enabled by default. Files over 64 KiB grow by up to about 3%, and smaller files occupy 64 KiB. Set `STORAGE_PAD_FILE_SIZES=false` to opt out. Existing downloads still play. `DOWNLOAD_SALT` is retired.
- On startup, media-load removes untracked files in its download directory, including downloads left after a database reset. Set `DOWNLOAD_PATH_EXCLUSIVE=false` if you store other files there.
- After 10 wrong passwords, an account can be locked for up to 15 minutes. New passwords must be at least eight characters, and sign-in response times no longer disclose whether an email is registered.
- Signing out revokes access tokens and closes live connections. Reuse of a rotated refresh token after 30 seconds also revokes its session.
- New audit entries, traces and server logs redact credentials or torrent identifiers where applicable. Browser sessions keep refresh tokens in HttpOnly cookies. Responses now include security headers, and the Caddy setup enables HSTS. Use `CSP_IMAGE_ORIGINS` for additional artwork hosts. Hono and TypeORM received security updates.
- Internal services can require a shared `SERVICE_TOKEN`. FlareSolverr and Jaeger images are pinned to specific versions.
- Schema updates run through explicit migrations. Before applying them, Miauflix backs up the database to `data/backups` and keeps the last three backups. The first startup after upgrading backs up and converts the existing database.
- Audit writes run off the request path. Daily cleanup removes expired sessions, QR codes and stream keys. API access logs are kept for 14 days and other audit entries for 90 days. The first startup clears the backlog.
- Live messages are rate-limited per user. The backend exits after an unexpected crash so Docker can restart it. The standalone catalog image can start offline, and repeated backend restarts no longer leave extra catalog instances running.
- Trakt setup needs only the client ID and redirect URI. Sign-in goes through `auth.trakt.tv`, and Home shows your Trakt lists as soon as you connect.
- Failed settings saves roll back, and setup reports all failing service checks together. In the setup wizard, Enter keeps a saved password and `--only-config` exits with an error if a required setting is missing.

### Development and removals

- Run `bun install` to install dependencies. Docker and CI use Bun too, and the root `bun.lock` covers the whole workspace.
- Pre-commit formats and lints staged files and runs type checks. Unit tests run before push. Backend E2E and frontend snapshot updates work again. See the [development workflow](docs/development/workflow.md#toolchain-at-a-glance).
- Backend and frontend files are grouped by feature. API errors use a consistent response body with an error ID that matches the server log.
- Removed the legacy nginx/certbot setup, `npm run deploy:frontend`, unused dependencies and files, and `STREAM_TOKEN_SECRET`. Playback session keys replace the old movie streaming endpoint (`POST /api/movies/:mediaId/:quality`), so `STREAM_KEY_SALT` is retired.
- The [storage privacy guide](docs/features/storage-privacy.md#what-the-disk-shows) explains what a disk copy can reveal. The [media-load guide](services/media-load/docs/chunk-stores.md) covers encrypted storage, and project plans and investigations live under [docs/plans](docs/plans/README.md).

## 2026-11-08 v0.2.0 Anime and improved subs

### Anime and subtitles

- Miauflix recognizes anime and searches by AniDB episode number, accounting for fansub naming, continuous numbering and batch releases. Anime providers are searched even when a general provider has already found a source. AnimeTosho is enabled by default for anime and marks SeaDex recommendations.
- Home can show AniList's seasonal, trending and all-time popular lists without an account.
- Shows that TMDB groups into one long season can use AniList's season layout. Tokyo Revengers, for example, shows four seasons. Existing progress follows the episodes, and notifications and Trakt sync use the appropriate numbering.
- Subtitles use outlined text near the bottom of the screen and move up when the controls open. Browsers render styled ASS/SSA tracks with their original positioning, colors, karaoke and bundled fonts. TVs use plain subtitles.
- Use Skip intro when the file marks its opening. If there's a post-credits scene, the player offers to skip the credits and jumps to it after five seconds unless you choose Watch credits. The next-episode countdown waits for the scene. On TV, press Down and then OK to use these actions.

### Profiles

- Who's Watching lets you choose from the accounts signed in on the device. Open your profile from Home's sidebar to switch, edit or sign out. Admins can add profiles.
- Give each profile a name and a 3D Plushie avatar. Samsung TVs can animate Plushies in the picker and editor.

### Playback and deployment

- Sources that have streamed well recently get a temporary boost among otherwise similar candidates. Episodes with poorly seeded sources can be searched again after six hours. Releases in your browser's languages or in English take priority over releases tagged for other languages.
- Playback takes priority over background downloads, and the seek bar shows which parts are already on disk. Tracker requests are batched and combine counts from multiple trackers.
- An episode's first play waits for at most one slow source lookup. Failed sources release bandwidth when playback switches away, and stopped previews release unused disk reservations. Failed audio and subtitle checks retry during playback.
- TV discovery uses detected addresses when `TV_PAIRING_ADDRESSES` is unset.
- The new media-load service handles downloads, streaming, tracker counts and storage on port 3004. It records transfer statistics and imports existing downloads on first startup. The main server now runs on Bun.
- Catalog, sources and media-load can run in separate containers or together with `docker-compose.all-in-one.yml`. Only sources, media-load and FlareSolverr use VPN routing. Without a working VPN, media-load plays existing downloads and disconnects from peers and trackers. Update the Compose files with `./update.sh --files`. You can remove `MIAUFLIX_UPSTREAM=vpn:3000`.

## 2026-11-03 v0.1.0 Samsung TV support, smarter sources, smoother playback, and better reliability

### Samsung TV app

- Install Miauflix on a Samsung TV and find your server on the local network or enter its address. See `docs/setup/samsung-tv.md`.
- Use the remote to sign in, renew expired QR codes, open Home's sidebar with Back and control playback. Source selection favors lower bitrates on TVs and slow connections.
- Home loads nearby rows ahead of time, moves more smoothly between titles and sharpens the hero backdrop when you pause on a title. Empty lists are hidden.

### Sources and notifications

- Source search runs in its own service and can find season packs and older episodes. Admins can manage providers, request budgets and definition repositories in Settings → Sources.
- Site definitions load at runtime from Prowlarr and the Miauflix indexer repository by default. You can add public Jackett definitions or connect your own Jackett or Prowlarr Torznab endpoint.
- The player skips fake releases and tries another source if one fails. If a title has no playable source, choose Notify me and Miauflix will tell you when it finds one.
- The notifications panel shows posters, quality and read status. Select a notification to start playback. The website and TV app also have new icons.

### Fixes

- Fixed server slowdowns after several hours and added automatic restarts when the server stops responding.
- Improved high-bitrate playback and made Continue Watching open the episode shown on the card.
- Fixed QR approval on a second device, remote navigation in subtitle search, and focus after changing the watchlist.
- Connecting Trakt now ends cleanly when you deny access or the code expires. Settings is visible only to admins.

### Security and upgrades

- The database encrypts sensitive viewing and storage details.
- Prebuilt installations update nightly. Run `scripts/update.sh` to update immediately.
- Docker now uses a base `docker-compose.yml` with optional files for features such as VPN and HTTPS. Source-built installations need the [data migration steps](docs/setup/docker-setup.md#moving-from-the-old-source-built-stack). If your secrets are in `.env`, follow the [environment setup instructions](docs/setup/docker-setup.md#secrets-set-in-env).
- Update the backend and its services together for this release.

## 2026-10-26 v0.0.2 Streaming reliability and HTTPS fixes

### Fixes

- Playback uses source scores again, so a well-seeded 1080p release can beat a poorly seeded 4K release.
- Live updates and notifications work behind HTTPS
- HTTPS and the VPN can be used together
- HTTPS streaming uses HTTP/1.1 or HTTP/2 to avoid the buffering seen over HTTP/3 on VPN connections.
- Playback no longer stops with "The SourceBuffer is full"
- The player no longer shows a blue rectangle around its controls

## 2026-10-25 v0.0.1 Smoother streaming and version display

### New

- Find the running version in the lower-right corner, except on Home, title details and the player.

### Fixes

- Less buffering on high-bitrate sources
- Lower server CPU use while streaming

## 2026-10-25 VPN with gluetun

### New

- The VPN setup uses gluetun with NordVPN over WireGuard. Its firewall acts as a kill switch.

### Fixes

- The quick start no longer turns off the VPN check

## 2026-10-25 Quick start deployment fixes

### New

- HTTPS with automatic certificates for the quick start

### Fixes

- The services container no longer crash-loops after a restart

## 2026-10-25 Search

### New

- Search with an on-screen keyboard, browse genres (with an Anime shortcut) and see recent searches
- Open search with the remote's Search key or from the sidebar

## 2026-10-24 Frontend refactoring

### New

- Home mixes fixed and popular categories, with Continue Watching
- Show details list seasons and episodes with your progress
- The opening animation respects reduced-motion settings

### Improvements

- Smoother scrolling on Home
- Community lists work even when their owner's profile is private

## 2026-10-24 TV Show discovery

### New

- Watch TV episodes, with the next episode prefetched and a countdown to it
- Episodes of shows on your watchlist are fetched automatically
- Notifications for new episodes and better-quality movies

## 2026-10-11 Subtitles and audio transcoding

### New

- Like, love, dislike or clear your rating for a movie or show.
- Pick a subtitle track, search OpenSubtitles or adjust subtitle timing from the player.
- Choose an audio track from the player. Unsupported audio is converted automatically.
- Storage screen to free space by deleting downloaded media

## 2026-10-10 Clearer logos and backdrops

### New

- Home picks logos that stand out against their backdrops.

## 2026-10-10 Trakt recommendations and playback progress

### New

- Connect Trakt to sync your watchlist and progress, and resume from Home
- Add titles to your watchlist and rate them from their details

## 2026-10-03 Details and in-app player

### New

- Movie and show details with watched indicators
- In-app player with resume and progress tracking

## 2026-10-01 Face-aware backdrop framing

### New

- Home backdrops keep faces and key content in view

## 2026-09-30 Community lists and browsing

### New

- Popular community lists on Home

## 2026-09-25 Playback preparation and storage

### New

- Titles you focus are prepared ahead, so playback starts faster

## 2026-09-24 Configuration and local HTTPS

### New

- Set up TMDB and Trakt from the setup screen
- Cached content stays available when a provider is down

## 2026-09-21 Trakt-backed list service

### New

- Sign in with a QR code
- Personal and public Trakt lists

## 2026-09-19 Catalog setup and service integration

### New

- Catalog setup in the first-run configuration
- Browse TV seasons and episodes

## 2026-08-27 Initial account setup

### New

- Create the first admin account and configure Miauflix from a guided wizard

## 2026-04-19 Runtime configuration

### New

- Change settings while Miauflix runs
- Run without a VPN

## 2026-04-10 Admin setup and home browsing

### New

- Home page with category rows

## 2025-12-28 Network resilience and statistics

### Improvements

- Source lookups can retry Cloudflare challenges through FlareSolverr.

## 2025-12-26 Intro audio

### New

- Sound for the intro animation

## 2025-11-10 Session authentication updates

### New

- Switch between multiple signed-in accounts

## 2025-08-17 Frontend and backend integration

### New

- Sign in with email or QR code

## 2025-08-10 Server rendering and browser testing

### New

- Animated logo intro
