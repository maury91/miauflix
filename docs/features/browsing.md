# Browsing and finding something to watch

[Back to all features](../features.md)

Miauwatch presents movies and TV shows in a visual catalog. You can explore the catalog before choosing something to play; you do not need to organize a folder of media files first.

## Movie and TV information

Title pages show artwork, a description, genres, and available catalog scores. TV pages let you move between seasons and episodes. Miauwatch currently gets this information from The Movie Database (TMDB).

A title appearing in the catalog does not guarantee that a playable source is available. The catalog describes the title; source discovery finds a copy that Miauwatch can play.

## Browse lists

The home screen organizes titles into rows. It loads more rows and titles as you browse, rather than loading the entire catalog at once. Connected list services can supply popular, trending, personal, and community lists. Anime rows come from AniList: the most popular anime airing this season, trending anime and all-time popular anime. They need no account; AniList counts each season of a show separately, so its seasons appear as one show, and titles TMDB does not list are left out.

Anime that TMDB keeps in fewer seasons than it really has (Tokyo Revengers is a single 63-episode season on TMDB) is shown with one season per AniList entry, in airing order, each named after its entry and with episodes starting again at 1. Specials stay in season 0. Long-running shows without separate entries, such as One Piece, keep TMDB's seasons. Progress, notifications and Trakt sync follow this numbering.

## Search by title or genre

Search lets you type a query, choose a genre, and move through pages of results. An on-screen keyboard helps when using a TV remote. Recent searches make it easier to return to something you looked for earlier, and you can remove recent entries.

## Details that load ahead

Miauwatch starts loading useful details while you move around the catalog. For shows, this can include the season you are likely to open next, such as the season you were watching. Returning from a title page restores focus to the selected card, which helps when browsing with a remote.

## Artwork suited to the screen

Miauwatch requests artwork sizes suited to cards, episode pictures, logos, and large backgrounds. The Samsung TV build also adjusts background image sizes to the TV's generation to balance sharpness and responsiveness.

Home cards are one picture each: your server draws the title's logo onto its backdrop (or the title's name, for titles without a logo) above the episode line, in the size the card needs, and keeps the most recently used pictures in memory (100 MB by default; `CARD_IMAGE_CACHE_MB` in the Media Catalog settings). One picture per card is quicker for the TV to draw than a backdrop and a logo on top of it.

## Planned improvements

[ToDo.md](../../ToDo.md) includes making input fields consistent throughout the app. Translated menus and an interface-language selector are also planned; see the language features in the [feature overview](../features.md).

## Implementation references

- [Home feed](../../frontend/src/pages/home/hooks/useHomeFeed.ts)
- [Title details](../../frontend/src/features/details/ui/MediaDetails.tsx)
- [Search page](../../frontend/src/pages/search/SearchPage.tsx)
- [Search behavior](../../frontend/src/features/search/search.middleware.ts)
- [Catalog service](../../services/media-catalog/src/catalog/catalog.service.ts)
