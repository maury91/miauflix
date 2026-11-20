# Miauflix Changelog

What changed, in short. Every detail is in [DETAILED_CHANGELOG.md](DETAILED_CHANGELOG.md).

## Unreleased

### New

- Samsung TVs now draw Home's rows and hero with WebGL by default, the faster way tested so far: moving along a row runs at about 50 fps. If a TV can't use it, or it stops working, Home switches to the regular rows by itself
- On Samsung TVs, Home’s hero waits for a short pause before updating the selected title’s details and backdrop. The details fade out while you move along a row.
- Samsung TVs get a TV version of files whose audio they cannot play (TrueHD, DTS). It is built once in the background, about 20 times faster than real time, and kept encrypted next to the download. It holds the original picture, one audio track per language in a format the TV decodes (surround kept, as AC-3 5.1), and every subtitle track as its own file. A TV playing such a file switches to the TV version as soon as it is built a minute past where you are, instead of converting the audio live (the picture holds still for about a second while it switches), so it seeks like any other file and no longer jumps. The next episode is prepared the same way once it has downloaded. The TV version is deleted with the download
- New look for sign-in, first-time setup, Home's title tiles, Search results, the title details page, source provider settings and the player's controls, the first screens on the new design system. On a title's page the watchlist and rating actions are round buttons whose name shows under the row as you reach them, the main action starts focused, choosing a season moves you to its episode to watch next, and episodes show their synopsis and watched progress. Sign-in and setup work with the remote throughout: Down moves through the fields, OK starts typing, the TV keyboard's Done moves on to the password, and a failed sign-in puts you back on the password. The sign-in form and the QR panel beside it are the same height. Buttons on plain backgrounds have an outline, so they look like buttons before you reach them. Home tiles draw their own focus outline. The player's buttons (Back, Retry, Notify me, Skip intro, Next episode, play, subtitles, full screen, mute and volume) share one style, play sits on the seek bar's row and Left/Right on it seek (the remote no longer stops on the seek bar, so it has no outline), and the seek bar keeps the paw as its handle; under a mouse it thickens and previews up to the pointer. The player's controls hide after a few seconds of playback without input and stay up while paused or while the subtitle panel is open; while they are hidden, Left/Right seek, Up/Down bring them back on the play button, and OK on a hidden button only brings them back
- On Samsung TVs the redesigned screens use a 24 px base above 1280 px wide and the 16 px web base at 1280 px or less. The other screens look the same as before
- Home and Search are now built from the new design system, with the same remote controls as before. On Home, Left from a row's first title opens the side menu and Back switches between the menu and the rows; the notifications and profile panels open beside the menu, with the page dimmed behind them. The rows sit on a black background and show a spinner while loading. When you have something in progress, focus starts on Continue Watching. Search shows the on-screen keyboard (letters and digits, then space, delete and **Clear**) only on TV, with popular genres (one per line) and recent searches under it (the column scrolls to keep the selected key or search in view), and the search box above the results beside it; results are Home's wide tiles in a grid that scrolls down. On TV the box only shows what you typed and the search runs as you type; elsewhere there is no on-screen keyboard, the box is ready to type in and Down moves to the results. Each recent search has its own remove button. The Miauflix logo lines up with the page. Coming back from a title's page, Search starts on the result you opened
- Who's watching and the profile editor are now built from the new design system. Who's watching shows the profiles as square tiles with their Plushie (still animated, hopping as you reach it) and the name centred under it; Add profile is a tile with a plus, and Left reaches Back. Manage profiles is gone: the profile under the highlight shows an edit button below it, Down reaches it and OK opens that profile's editor. In the editor the remote moves through the name, the look's tabs, every picture and colour, Fine-tune's sliders and Save/Cancel, the form scrolls to follow, and OK picks a part (moving onto it no longer does). Back while typing closes the keyboard first, and Back on the name (where the editor opens) leaves it
- Home's side menu panels are rebuilt as lists. Notifications start on the newest one, mark unread ones with a **New** badge and keep **Mark all as read** at the top; the profile panel shows the profile with **Switch profile**, **Edit profile** and **Logout**. The Settings page is gone: highlighting Settings opens a panel with Configuration, Storage and Sources (and the server on TV), each with a short description, and coming back from one returns to Settings in the menu. Right enters a panel, Left or Back returns to the menu

### Fixes

- Samsung TVs: moving between Home's rows is smoother (about 6 fps faster with the WebGL rows): each row keeps fewer titles ready out of view, still showing the next one peeking at its edge
- Samsung TVs no longer sign out when the app is closed or reloaded while it renews its session: opened again within 30 seconds, it carries on signed in
- Samsung TVs with the WebGL rows: the pointer outlines the title it is on (not the first one in the row) and opens a title from its name or description under the picture too; quality badges on the drawn cards are as wide as elsewhere; Home no longer stays loading when a backdrop's framing or a logo is slow to arrive, or shows an error screen when the WebGL part of the app fails to download (it uses the regular rows); a busy button's spinner stays in the button; and with reduced motion an updated card no longer shows its old picture through the new one
- A list row no longer fails to open when a later page of the list cannot be loaded from its provider (Trakt, AniList): it shows the titles already loaded, and the rest once the provider answers again. A title the catalog fails to load for a moment keeps its place in the row instead of disappearing from it
- Home: Continue watching shows every title you are watching, even with many in progress. On a TV with about 17 titles, several cards used to stay missing because the app asked for each title separately and the server turned the extra requests away. Its cards never stay loading when the server answers with something unexpected
- The catalog service's Docker image starts without internet access: it used to download its image library from the package registry on every start, and stopped with an error when it could not
- Samsung TVs with the WebGL rows: Home no longer stays black when the TV takes the graphics memory back; it redraws itself at once
- Samsung TVs with the WebGL rows: Home's rows and hero no longer blink black for a moment every so often
- Samsung TVs with the WebGL rows: the Smart Remote's pointer highlights and opens Home's titles again; a loading row shows its spinner and a failed one its warning icon; text on the highlighted title stays sharp; and if the TV's graphics stop working for more than a few seconds, Home switches to its regular rows instead of staying black. With reduced motion turned on, the drawn rows and hero move without animation
- Samsung TVs with the WebGL rows: Home does less work on every frame while you move, and a long synopsis no longer stalls the hero for a moment when it changes. Older TVs (2018 and 2019) keep less graphics memory for it
- Home's hero darkens the bottom right of its picture again, so the rows below stand out from it
- Samsung TVs with the WebGL rows: Home falls back to the regular rows if the WebGL drawing can't start, the focus outline stays on the focused card after a resize, a failed backdrop no longer blanks the hero, rows show “Loading...” while they load, the hero's source status is announced to screen readers, the intro waits until the hero's backdrop can be drawn, a card's new artwork replaces the old one without flashing empty, and quality badges show on the drawn cards
- Rows from Trakt lists that also hold episodes (like the Marvel Cinematic Universe list) no longer turn into empty cards after the first twenty: they show every film and show in the list, with no empty cards in between, and end where the list does
- Home's hero no longer shows the left edge of its picture: the shade is fully dark up to where the picture starts
- On Samsung TVs, rows above the ones you passed no longer show up empty (black) when you go back up quickly: they keep the cards they had
- Home: the last rows scroll up into the same place as the others, so the row above no longer shows under the hero
- The player no longer says "Trying source N of M" after a seek or audio track switch with converted audio. It says what the server is doing instead: downloading that part of the file, or converting it
- Home: rows you scroll to with the mouse wheel or touch, without pointing at a title, now load instead of staying empty
- The player no longer stays on "Trying source…" forever when a source fails before its file can be checked: it moves on to the next source
- Large downloads start right away. A new 40 GB download used to spend minutes checking an empty file before it could stream, so playback timed out on it and the download service stopped answering in the meantime
- Resume Watching on a file whose audio is converted (TrueHD, DTS) no longer stays on "Trying source…" forever: the player could lose the converted stream right as it started
- Blu-ray H.264 releases no longer stop with a decode error a few seconds in on Chrome for Mac when their audio is converted, which made the player give up on the source
- A source downloading faster than the video needs is no longer abandoned for taking long to start (resuming far into a large file, for example), which threw away what it had downloaded
- The player skips sources too large to fit in storage, even after freeing what can be freed, instead of trying them and getting stuck. When none fits, it says there isn't enough space to play the movie or episode
- Miauflix now deletes files in the download folder that aren't its downloads (for example downloads left behind after deleting its database), when the download service starts. Set `DOWNLOAD_PATH_EXCLUSIVE=false` if that folder holds other files
- Samsung TVs no longer jump every few seconds while playing a file whose audio is converted
- Samsung TVs that report their codecs no longer get a release whose video they cannot play (AV1 on a TV without it, for example), and building a TV version no longer risks filling the disk: it makes room first, or is skipped when there is none. A release whose TV version exists, or is being built, is kept instead of being swapped for another release, since it plays natively (or soon will). A TV version you are waiting for now starts as soon as its download finishes, instead of waiting for a background one to end. Moving to a release that plays as it is no longer fails for lack of room while the release it leaves is still kept
- The server no longer fails to start when `CSP_IMAGE_ORIGINS` is not set
- The catalog service no longer slows down to the point of not answering after the server restarts a few times, and it stops retrying SVG logos it cannot check every hour
- Login is harder to abuse: an account refuses logins for up to 15 minutes after 10 wrong passwords, new accounts need passwords of at least 8 characters, and response times no longer reveal which emails have accounts
- Logging out, or a stolen refresh token being used, now ends the session everywhere at once: its access tokens stop working and its live connections close. A refresh token used more than 30 seconds after it was replaced revokes the session (sooner, it is only refused, since two tabs refreshing at once look the same)
- The internal services can require a shared secret (`SERVICE_TOKEN`), recommended when running them outside Docker. FlareSolverr and Jaeger images are pinned to a version
- Security fixes: new audit log entries no longer store refresh tokens, stream tokens or streaming keys (entries already written keep them), and neither do exported traces; script on the web app's page can no longer read a refresh token; responses now carry security headers (a Content Security Policy among them; set `CSP_IMAGE_ORIGINS` if artwork comes from a host other than TMDB's), and the Caddy setup turns on HSTS. Hono and TypeORM are updated for known vulnerabilities
- New downloads are encrypted more securely on disk. Each download gets its own random key and random file and folder names, so a copy of the disk can no longer be checked for a given torrent by name or key, or decrypted with knowledge of one file. File sizes can still match known torrents unless they are padded (on by default, see below). Downloads you already have stay readable as they are. The `DOWNLOAD_SALT` setting is no longer used
- Downloaded files are padded with random bytes so their sizes on disk cannot be matched to known torrents. Files over 64 KiB grow by at most about 3%; smaller files all take 64 KiB, which can be many times their size. Set `STORAGE_PAD_FILE_SIZES=false` to turn it off
- Logs no longer show which torrents were downloaded: info hashes, magnet links and movie titles next to their sources are left out, and anything that still looks like an info hash or magnet link is replaced with `[redacted]`
- Server errors now say what went wrong where it went wrong. When search, a title or a Home row fails, the page explains it: a problem an admin can fix says how (for example, search needs TMDB to be configured; admins also see why, such as TMDB rejecting the access token), anything else shows an error id, also written to the browser console, to look up the cause in the server logs. Before, a failed search only said it was unavailable and other failures showed a generic message
- Search has clearer "no results" and "unavailable" screens: a big message with what to do, a **Clear search** or **Try again** button you can reach with the remote, and the error id and server details tucked under **Technical details**
- The server no longer slows down or grows its database with every request: requests (video included) no longer wait for their audit log entry to be saved, the database uses WAL, and a daily clean-up deletes expired logins, QR codes and streaming keys, API access log entries after 14 days and other audit entries after 90. The first start after updating deletes the backlog
- Updates no longer change the database's tables unattended: schema changes now come from explicit migrations, and the server backs the database up to `data/backups` before applying any (it keeps the last 3). The first start after updating backs up and converts the existing database
- After an unexpected crash the server now exits and Docker restarts it, instead of carrying on in an unknown state
- The live connection (search, navigation, progress) is now rate-limited per user, so one client can no longer flood the server or the catalog with searches
- Saving settings now fails and rolls back when a service is not working afterwards, and a key sent twice is saved with the value that was tested. The next episode is prepared even when it changes while the previous one is still being prepared. Background downloads paused for a stream are resumed reliably, and a finished download's buffering progress counts only what is stored. Download progress of a single episode counts that episode, not the whole season pack, and freeing space while an episode completes can no longer mark deleted files as downloaded
- Setup: `--only-config` now exits with an error when a required setting is still missing, the setup check reports every failing service at once, and pressing Enter at a password prompt keeps the saved password. The player resumes where you left off even when the stream reports its length late
- Samsung TVs play more files as they are: when a file's audio would have to be converted (for example TrueHD), the player first looks for another source of the same title that the TV plays directly, and converts only when none does. TVs that can report their codecs (Tizen 6 and newer) send the full list, so files with any audio or video they decode are no longer converted or skipped. Jumps the player makes over stalls in converted playback are now written to the server log
- Trakt can be set up with apps created on Trakt today, which no longer come with a client secret: setup asks only for the client ID and redirect URI. A secret saved earlier is ignored. Trakt sign-in now uses Trakt's sign-in address (`auth.trakt.tv`), as Trakt asks
- After you connect Trakt, Home shows your Trakt lists and watchlist right away, without reloading the page
- Samsung TVs: a move along a Home row does less work in the app itself (it no longer redraws the whole row), so held keys answer sooner; the frame rate is unchanged
- Home cards show the title's logo higher and larger, clear of the episode line (`S1 E1`) under it. Each card is now one image from your server, the backdrop with the logo already drawn in, or the title's name when it has no logo; the server keeps the most recently used ones in memory (100 MB by default, `CARD_IMAGE_CACHE_MB` in the Media Catalog settings)

### Development

- `bun run test:backend:e2e` and `bun run test:frontend:snapshots:update` pass again, and the snapshot update no longer reinstalls every dependency on each run
- Samsung TVs, experimental: a build option (`MIAUFLIX_TV_GL_ROWS=true` for `scripts/package-tizen.sh`, off by default) draws Home's rows with WebGL instead of the page. Holding Right runs at 33–40 fps instead of 14–17, and moving between rows at 47–51 instead of 27–35. Pointer and screen-reader highlights don't line up with the drawn rows yet. With the option, Home's hero is drawn the same way, with PixiJS, each card is drawn once and reused, and the focus outline stays in one place while the cards slide under it: holding Right runs at 48 fps, a first pass along a row at 51–60 and going back at 58–60
- The WebGL drawing behind that option is split into small, separately tested parts, with no change on screen; the spike as measured is kept on the `tv-gl-spike` branch for comparison. Each tile's look is now described once and shared by the page and the WebGL drawing, so the two can't drift apart. The web app no longer downloads the WebGL renderer, so its main script is about a quarter smaller
- Bun now installs the dependencies everywhere (Docker images, CI, local setup): run `bun install` instead of `npm install`. `bun.lock` is the only lockfile; `package-lock.json` is gone
- Code is easier to find: backend services and the web app's Home screen are reorganized by area (player, title details, progress, notifications, Trakt), with no change in behaviour
- Backend layers point one way: services no longer depend on route files, routes no longer reach into repositories, and the largest services are wired with named options instead of long argument lists. No change in behaviour
- Every API error now answers with the same body (status, code, message and an error id that matches the server log), where many routes sent only `{ error }`; the `error` text is unchanged. Unexpected failures on movie and show pages are logged with their cause instead of only printed to the console
- Committing is faster: the pre-commit hook formats and lints only the staged files and type-checks, and the unit tests run before each push instead. The last stray lockfiles (`backend-e2e/package-lock.json`, `services/media-catalog/bun.lock`) are gone, and the [development workflow](docs/development/workflow.md#toolchain-at-a-glance) says which tool does what and which test runner each workspace uses

### Removed

- The old nginx/certbot HTTPS setup (`setup-ssl.sh`, the `nginx/` folder and its scripts) and `npm run deploy:frontend`: HTTPS has been set up with Caddy (`docker-compose.https.yml`) for a while. `STREAM_TOKEN_SECRET` was never used and is no longer generated
- Unused code and files: the backend's copy of the torrent engine's type definitions, six backend dependencies nothing imported, the frontend's unused Jest config, a stray `image.png` and the outdated `todo/` folder (`ToDo.md` is the task list)
- The old movie streaming keys (`POST /api/movies/:mediaId/:quality`), which the app stopped using when playback moved to playback sessions: video is streamed only with a playback session's key. The `STREAM_KEY_SALT` setting goes with them; a saved value is ignored

### Documentation

- New guide to what a copy of the server's disk shows, and the plan to keep the database that links downloads to torrents on an external server such as AWS RDS: [storage privacy](docs/features/storage-privacy.md#what-the-disk-shows)
- Documentation no longer points at code that moved: the security, audit log, streaming, storage and architecture docs describe the current services, the encrypted storage doc moved to the [media-load service](services/media-load/docs/chunk-stores.md), and plans and past investigations now live apart in [docs/plans](docs/plans/README.md)

## 2026-11-08 v0.2.0 Anime and improved subs

### New

- **Anime sources**: anime is recognised automatically and searched the way anime is released, by AniDB episode and with the names fansub groups use ("2nd Season - 07", episode numbers counted from the first episode, batches). Later seasons that TMDB lists as one long season are matched to the right episode, and the episode is found inside batch downloads. A new AnimeTosho source is on by default and only used for anime; it marks SeaDex's recommended releases. Anime sources, including general sites with an anime category such as Nyaa, are always searched for anime, even when another source already found the episode
- **Anime rows**: Home can show the anime lists, from AniList: popular this season, trending and all-time popular. No account needed
- **Anime seasons**: anime that TMDB keeps in one long season is split into its real seasons, one per AniList entry, each named after it (Tokyo Revengers shows 4 seasons instead of one with 63 episodes). Progress, notifications and Trakt sync follow the new numbering, and what you already watched moves with it

### Improvements

- Episodes whose saved sources have few seeders are searched again (at most every 6 hours), so sources enabled later can offer a better copy
- Releases made for another language (a French dub, VOSTFR, an Italian release…) are played only when nothing in your language or English is available, whatever their quality. Your browser's languages decide what counts as yours. Release names are now read for more language tags: Italian ("SubITA", "iTALiAN"), English ("EngSub"), Japanese ("JP", "JAP") and Lithuanian ("LT subs", "Lietuvių")
- Seeder and leecher counts are checked for many sources at once and combine every tracker's answer, so they are more accurate and use less tracker traffic
- What you're watching gets peers and bandwidth before background downloads, so playback starts sooner while other titles download
- Torrent downloading, streaming, seeder counts and download storage now run in a new internal service, media-load, in the services container (port 3004). The downloads folder is now mounted on the services container instead of the main one, and downloads you already have are handed to it automatically the first time it starts. It is also published on its own as the `miauflix-media-load` image
- The player's progress bar shows which parts of the video are already downloaded, updated every second
- Subtitles sit lower on the screen, as outlined text without a black box, and move up out of the way while the player controls are open
- Anime subtitles are drawn in the font the release ships for them, when the video carries it
- **Styled subtitles**: in the browser, ASS/SSA subtitles (most anime releases) are now shown as their authors made them: signs translated in place, positions, colours, karaoke and every font the release ships. TVs keep the plain subtitles
- **Skip intro**: a "Skip intro" button appears while a video's opening plays, when the file marks it with a chapter ("Intro", "Opening", "OP"); it never skips on its own. On a TV, press Down from the video to select it (it turns white), then OK. "Skip credits" and "Play next episode" are reached the same way
- When a scene follows the credits ("Post-Credits", an epilogue after the anime ending), the player offers to skip the credits and jumps to the scene after 5 seconds; "Watch credits" keeps them. The next-episode countdown waits until that scene
- media-load records each download's speed, peers and total bytes received and sent (not shown in the app yet)
- Services can be laid out freely: catalog, source search and media load each have their own image (`miauflix-catalog-services`, `miauflix-sources`, `miauflix-media-load`), and `miauflix-services` still runs them all in one container (`docker-compose.all-in-one.yml`). With the VPN only source search, media load and FlareSolverr go through it now; the backend and the catalog no longer do. Source search and media load each check their own VPN connection, so they can run on other servers, and the status page shows each one's check. Without a VPN, media load disconnects from peers and trackers and only plays what is already downloaded. Update your compose files with `./update.sh --files`; `MIAUFLIX_UPSTREAM=vpn:3000` is no longer needed
- The main server now runs on Bun instead of Node.js, like the other services. Nothing to change in your setup; existing accounts and data keep working

### Fixes

- TVs on your network can find the server again when no TV pairing addresses are set: the announcement failed with an error instead of using the detected addresses
- Anime releases that carry their own fonts (most fansubs) could not be inspected, so the next-episode countdown, audio conversion and track choice never kicked in; their "Ending" chapter now also starts the next-episode countdown
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
