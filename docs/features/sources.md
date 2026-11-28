# Finding something to play

[Back to all features](../features.md)

A source is a particular downloadable release of a movie or episode. Several sources might offer the same title in different qualities, languages, or file formats. Miauwatch searches for these releases and checks them before playback.

Media is downloaded through BitTorrent, which transfers pieces of a file between participating computers. The group sharing a particular download is called its swarm. A provider, sometimes called an indexer, helps locate a release; it does not guarantee the swarm has enough people online to play it smoothly.

## Adding providers

Miauwatch comes with no providers. An administrator adds the ones they choose during first-run setup, or later under **Settings → Sources**, and turns them on; until at least one is on, no searches run. A provider starts switched off when it is added. Servers set up before this change keep the providers they had.

Miauwatch doesn't recommend any site: check that the providers you add are legal to use where you live.

## Background and on-demand searches

Miauwatch looks for sources in the background, so it can prepare titles before you press Watch. If a title still needs sources, it can search when you open or request it. Results arrive as providers respond rather than waiting for every provider to finish.

Discovery depends on the configured providers and their availability. Finding a title in the catalog does not guarantee a playable source exists.

## Searching several providers

A provider is a website or service that helps find releases. Miauwatch can search several providers, combine their results, and remove duplicates. Searches use title identifiers where supported, with title-based alternatives when needed.

For TV shows, it can look for individual episodes or a whole-season download. A season pack contains separate episode files; support for two episodes combined into one video is a different, unfinished feature described under [Watching](watching.md).

## Anime

Anime is recognised from a public list that links TMDB titles to AniList and AniDB entries; no setting is needed. TMDB often lists several anime seasons (cours) as one long season, while release groups number each cour from 1 ("2nd Season - 07") or count from the first episode ("- 31"). Miauwatch works out which cour and episode a TMDB episode is from the air dates, searches with the AniDB episode id where a provider supports it, and with the anime's romaji and English titles otherwise. It accepts a release only when its season and number fit, and finds the episode's file inside batch downloads.

Providers built for anime are only used for anime; Miauwatch marks the releases SeaDex recommends when a provider's definition reports them. Specials and OVAs, a preference for recommended releases or particular groups, and Japanese audio by default are not implemented yet.

## Checking sources before playback

An indexer's search result is only a candidate. Miauwatch also inspects torrent information and verifies whether the source contains usable video. Playback considers quality and device compatibility, and can try another source when one is unusable.

The automatic selection behavior and planned manual quality picker are described under [Watching](watching.md).

## Adding sources with Cardigann definitions

A Cardigann definition is a small instruction file that teaches Miauwatch how to search an indexer. This lets administrators add supported indexers without writing a new Miauwatch integration for every site.

Miauwatch can obtain Jackett/Prowlarr-format definitions from configured repositories and refresh them when they change. The Add providers screen lets an administrator browse and search the supported definitions, then install them.

Compatibility is partial: Miauwatch does not implement every Cardigann instruction. Unsupported definitions and private-tracker sign-in flows are excluded from this path.

## Connecting Jackett or Prowlarr

If you already run Jackett or Prowlarr, you can connect its Torznab endpoint by supplying a name and address, plus an API key when the endpoint requires authentication. Torznab is a shared search format that lets these applications communicate.

This is a working integration. An arbitrary website address is not enough to create a provider, and the declared generic HTTP provider type does not currently have a working implementation.

## Adding Stremio addons

Stremio addons that return torrents can be added by pasting the addon's install link under Sources → Advanced setup. Configure the addon on its own page first, because its settings (and any keys) are part of the link; Miauwatch keeps the link hidden after saving it.

Only results that are torrents are used. Results that come from debrid services or other direct links are skipped for now, and anime is searched only through providers that support it.

## Administrator source controls

Administrators can enable or disable providers, test whether they respond, change their order, edit supported settings, and remove user-added providers. Provider repositories can also distribute provider definitions and updates.

Miauwatch limits requests, caches results, and temporarily backs off from failing providers. Background searches share the available request budget with interactive searches, so background work does not use every request allowance.

## FlareSolverr support

Some supported indexers present browser checks that prevent a normal search request. An optional FlareSolverr service can handle supported checks for source searches. Providers that require it need FlareSolverr to be configured; it does not guarantee access to every protected website.

## Running or replacing the source service

Source searching runs in a separate service that can be deployed in Docker. Developers can replace it with a compatible service that follows Miauwatch's communication contract. Installing any Docker image does not automatically turn it into a source provider; ordinary source additions use Cardigann definitions or Torznab.

## Implementation references

- [Search planning and request budgets](../../services/sources/src/planner/planner.ts)
- [Anime identity and release matching](../../services/sources/src/anime/)
- [Implemented provider types](../../services/sources/src/providers/registry.ts)
- [Provider management](../../services/sources/src/providers/admin.ts)
- [Torznab integration](../../services/sources/src/providers/torznab/torznab.ts)
- [Stremio addons](../../services/sources/src/providers/stremio/stremio.ts)
- [FlareSolverr handling](../../services/sources/src/http/http-client.ts)
- [Administrator Sources page](../../frontend/src/pages/settings/SourcesPage.tsx)
