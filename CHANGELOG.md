# Miauflix Changelog

What changed, in short. Every detail is in [DETAILED_CHANGELOG.md](DETAILED_CHANGELOG.md).

## Unreleased

### New

- **Anime sources**: anime is recognised automatically and searched the way anime is released, by AniDB episode and with the names fansub groups use ("2nd Season - 07", episode numbers counted from the first episode, batches). Later seasons that TMDB lists as one long season are matched to the right episode, and the episode is found inside batch downloads. A new AnimeTosho source is on by default and only used for anime; it marks SeaDex's recommended releases. Anime sources, including general sites with an anime category such as Nyaa, are always searched for anime, even when another source already found the episode
- **Anime rows**: Home can show the anime lists, from AniList: popular this season, trending and all-time popular. No account needed
- **Anime seasons**: anime that TMDB keeps in one long season is split into its real seasons, one per AniList entry, each named after it (Tokyo Revengers shows 4 seasons instead of one with 63 episodes). Progress, notifications and Trakt sync follow the new numbering, and what you already watched moves with it

### Improvements

- Episodes whose saved sources have few seeders are searched again (at most every 6 hours), so sources enabled later can offer a better copy
- Releases made for another language (a French dub, VOSTFR, an Italian release…) are played only when nothing in your language or English is available, whatever their quality. Your browser's languages decide what counts as yours. Release names are now read for more language tags: Italian ("SubITA", "iTALiAN"), English ("EngSub"), Japanese ("JP", "JAP") and Lithuanian ("LT", "Lietuvių")
- Seeder and leecher counts are checked for many sources at once and combine every tracker's answer, so they are more accurate and use less tracker traffic
- What you're watching gets peers and bandwidth before background downloads, so playback starts sooner while other titles download
- Torrent downloading, streaming, seeder counts and download storage now run in a new internal service, media-load, in the services container (port 3004). The downloads folder is now mounted on the services container instead of the main one, and downloads you already have are handed to it automatically the first time it starts. It is also published on its own as the `miauflix-media-load` image
- The player's progress bar shows which parts of the video are already downloaded, updated every second
- media-load records each download's speed, peers and total bytes received and sent (not shown in the app yet)
- Services can be laid out freely: catalog, source search and media load each have their own image (`miauflix-catalog-services`, `miauflix-sources`, `miauflix-media-load`), and `miauflix-services` still runs them all in one container (`docker-compose.all-in-one.yml`). With the VPN only source search, media load and FlareSolverr go through it now; the backend and the catalog no longer do. Source search and media load each check their own VPN connection, so they can run on other servers, and the status page shows each one's check. Without a VPN, media load disconnects from peers and trackers and only plays what is already downloaded. Update your compose files with `./update.sh --files`; `MIAUFLIX_UPSTREAM=vpn:3000` is no longer needed

### Fixes

- Playback could fail to start with a server error ("could not load any of its sources"); it plays again
- An episode's first play waits for at most one slow download lookup instead of one per candidate, so it starts sooner
- When playback switches away from a source that stopped working, that source stops downloading instead of competing with the new one for bandwidth
- Starting a large download no longer deletes finished downloads to make room: downloads you only previewed or stopped no longer hold on to their full size
- Audio and embedded subtitles are checked again shortly after a check fails, for example right after playback switches source, instead of staying unavailable for the rest of the session
- Signing in a TV by scanning its QR code works again: the phone no longer keeps asking you to sign in
- On Samsung TVs, Who's watching now shows the profiles' animated 3D Plushies, and the editor draws them too; Home's sidebar shows your Plushie in 3D (still) on every device
- On Samsung TVs, the profile and notifications panels and the episode list are laid out properly again (the profile panel no longer shows giant icons running off the screen), and the profile editor's shape and fabric pictures fill their tiles

## 2026-11-03 v0.1.0 Samsung TV support, smarter sources, smoother playback, and better reliability

### New

- **Profiles**: Who's watching shows the accounts signed in on the device; pick one to watch, switch, edit or log out of your profile from the avatar at the bottom of Home's sidebar, add profiles (admins) and edit each one's name and Plushie
- **Samsung TV app**: install Miauflix on a Samsung TV, which finds your server on the network by itself or lets you type its address (see `docs/setup/samsung-tv.md`)
- **No more fake sources**: fake releases (an `.exe`, an archive) are detected and never picked again, and titles with no real source are marked "No source"
- **Automatic source fallback**: when a source fails, the player tries the next one by itself
- **Notify me**: for a title with no source yet, get a notification as soon as one is found
- **Automatic updates**: installs using the prebuilt images update themselves every night, and `scripts/update.sh` updates right away
- **New notifications panel**: posters, quality, read/unread, and a click starts playing
- New website and TV icons

### Improvements

- Sources that recently streamed well are preferred among otherwise close candidates, while respecting quality and device preferences. The ranking boost fades over time.
- Much smoother Home on the TV: faster moves along and between rows, rows ready before you reach them
- On slow connections (and on the TV) Miauflix picks lighter sources for movies and episodes, so playback starts instead of freezing
- Sharper backdrops on the TV's Home: newer TVs get larger ones, and resting on a title swaps in a sharper backdrop
- TV remote: Back opens the sidebar on Home, and the player's controls and Play/Pause keys work
- Empty rows (like an empty watchlist) are hidden

### Fixes

- TV episodes now find season packs and older episodes; source search runs in a separate service.
- **Sources settings**: admins can enable, disable and reorder source providers, test them, set request budgets and add provider repositories from Settings → Sources.
- **Sources are definitions**: Miauflix ships no code for any particular site. Indexers come from definition lists fetched at runtime (Prowlarr's by default, plus a small `maury91/miauflix-indexers` list), which you can change or extend with your own URLs.
- **More source providers**: add public Jackett indexers (no Jackett needed) or your own Jackett/Prowlarr Torznab endpoints from Settings → Sources.

- The server no longer slows down after running for a few hours
- A server that stops responding is restarted automatically
- Fewer playback freezes on high-bitrate files
- TV login works with the remote, and an expired QR code can be renewed
- The intro on some TVs grows all of the logo's letters again, instead of two, and no longer shows two logos
- In the player, Find subtitles keeps the remote working while it searches
- On the TV, the remote never gets stuck with nothing selected: adding or removing a title from the watchlist keeps it on the button, and if focus is ever lost an arrow key brings it back
- Search results on older Samsung TVs show full-size posters instead of half-width ones
- Signing in on the TV with the QR code while its keyboard is open no longer starts the intro too high
- Approving a QR login from another device works again
- Continue watching opens the episode its card shows
- Connecting Trakt ends cleanly when access is denied or the code expires
- Settings is shown only to admins

### Security

- What you store and watch is encrypted in the database

### Breaking changes for self-hosters

- The Docker setup changed: one base `docker-compose.yml` plus optional files for VPN, HTTPS and more. Source-built installs move their data with `docs/setup/docker-setup.md#moving-from-the-old-source-built-stack`
- If you set secrets in `.env`, keep passing them (see `docs/setup/docker-setup.md#secrets-set-in-env`)
- Update the backend and its services together for this release

## 2026-10-26 v0.0.2 Streaming reliability and HTTPS fixes

### Fixes

- Better sources are picked for playback (well-seeded over huge, poorly seeded ones)
- Live updates and notifications work behind HTTPS
- HTTPS and the VPN can be used together
- No more constant buffering behind HTTPS for viewers on a VPN
- Playback no longer stops with "The SourceBuffer is full"
- The player no longer shows a blue rectangle around its controls

## 2026-10-25 v0.0.1 Smoother streaming and version display

### New

- The running version is shown in the corner of the screen

### Fixes

- Less buffering on high-bitrate sources
- Lower server CPU use while streaming

## 2026-10-25 VPN with gluetun

### New

- New VPN container (gluetun, NordVPN over WireGuard) with a kill switch

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

- Rate movies and shows: like, love or dislike
- Subtitles: pick, search (OpenSubtitles) and sync them from the player
- Choose the audio track; unsupported audio is converted automatically
- Storage screen to free space by deleting downloaded media

## 2026-10-10 Improved artworks

### New

- Better-looking logos and backdrops on Home

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

- More reliable access to sources behind Cloudflare

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
