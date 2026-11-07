# Miauflix features

Miauflix is a streaming app you run on your own computer or server. It brings together movie and TV information, finds playable files, and sends video to your browser or Samsung TV. You do not need to organize a media library by hand.

## [Browsing and finding something to watch](features/browsing.md)

- Browse movies and TV shows with posters, descriptions, genres, and scores.
- Browse a show's seasons and episodes.
- Search by name, explore genres, and revisit recent searches.
- Use an on-screen keyboard with a TV remote.
- Browse popular, trending, community, and personal lists through Trakt.
- Browse anime rows from AniList: popular this season, trending, and all-time popular.
- Load more titles as you browse, with artwork sized for your screen.

## [Watching movies and episodes](features/watching.md)

- Start watching while a file is still downloading.
- Let Miauflix choose a suitable source and try another if one fails.
- Prepare files while browsing and download upcoming video ahead of playback.
- Reuse already downloaded files.
- Pause, seek, change volume, and enter fullscreen.
- Resume where you left off with Continue watching.
- Prepare and automatically move to the next episode.
- Skip credits using available chapter information or an end-of-episode countdown.
- **Planned:** choose quality from Watch Now and see the highest available quality more clearly.
- **Planned:** correctly handle two or more episodes combined in one video.
- **Planned:** better detection of credits and scenes during or after them.

## [Audio, subtitles, and video compatibility](features/audio-subtitles.md)

- Choose an audio track, with automatic matching to preferred languages when possible.
- Convert unsupported sound to a browser-friendly format.
- Keep compatible sound and video unchanged when repackaging a file for playback.
- Play H.265/HEVC on compatible devices, or optionally convert it for other devices.
- Find subtitles embedded in a video or included beside it in the torrent.
- Search OpenSubtitles for movie subtitles when configured.
- Choose subtitle languages and adjust subtitles that appear too early or too late.
- Remember subtitle preferences for an account and title.

## [Samsung TV and remote controls](features/samsung-tv.md)

- Package and install Miauflix as a Samsung Tizen TV app.
- Use Samsung's native video player for supported files.
- Navigate browsing, details, and player controls with a remote or keyboard.
- Use compatibility adjustments and appropriately sized artwork for older TVs.
- Find a Miauflix server on your network, enter its address, or change servers.
- Reconnect to a remembered server and sign in by scanning a QR code.

## [Accounts and your personal collection](features/accounts.md)

- Use separate accounts with their own watchlists, ratings, progress, and notifications.
- Give administrators permission to configure the server and create accounts.
- Choose who's watching from the profiles signed in on a device, switch from Home's sidebar, and give each profile a name and a Plushie avatar.
- Sign in with a password or approve QR-code login from another device.
- Keep a personal watchlist and rate titles with Like, Dislike, or Love.
- Connect Trakt to synchronize watchlists and playback progress.
- Get notifications about better movie sources and newly available episodes.
- Ask to be notified when an unavailable title becomes playable.
- Read notifications and mark them individually or all at once as read.
- **Planned:** signing in an existing account from Who's watching.

## [Finding and adding video sources](features/sources.md)

- Discover sources in the background and search when you open a title.
- Search multiple providers and remove duplicate results.
- Find individual episodes and episodes inside season downloads.
- Search anime by AniDB episode and fansub naming (cour and absolute numbers, batches), with AnimeTosho for anime.
- Check that a candidate source contains usable video.
- Add supported Cardigann definitions or connect external Jackett/Prowlarr services through Torznab.
- Manage providers: add, configure, enable, disable, test, reorder, and remove them where supported.
- Reuse cached searches and control provider priorities and request budgets.
- Use FlareSolverr for supported websites that require it.

## [Storage and privacy](features/storage-privacy.md)

- Store downloaded video in encrypted form and protect selected sensitive application data.
- Control torrent connection, download, upload, and seeding limits.
- Keep downloaded files after seeding ends so they can be played again.
- Automatically free storage while protecting active playback.
- View storage use and remove inactive downloads from an administrator dashboard.
- Check for a VPN and deploy through NordVPN with Gluetun.
- **Planned:** check VPN speed and choose a VPN country or exit server from Settings.

## [Running and maintaining your server](features/hosting.md)

- Run with Docker on AMD64 or ARM64 systems.
- Create the first administrator account and configure services in the browser.
- Test service settings and see connection status.
- Run catalog, list, and source services separately; developers can supply compatible replacements.
- Add HTTPS with the supplied deployment configuration.
- Use the supplied automatic container updates and unhealthy-container recovery.
- Enable request tracing to investigate slow operations.

## [Languages, translation, and learning — planned](features/languages.md)

- **Planned:** translate the interface, including Italian and Lithuanian.
- **Planned:** choose an interface language and account-level default audio and subtitle languages.
- **Planned:** choose whether subtitles should start enabled.
- **Planned:** translate subtitles using language models.
- **Planned:** use partially translated subtitles to help learn a language.

The backlog also includes more consistent form controls and additional end-to-end tests. These improve usability and reliability rather than adding a separate viewing feature. See [ToDo.md](../ToDo.md) for the working task list.
