# Miauflix Changelog

## 2026-10-11 Separate data and UI layers in frontend

### Bug fix

- Show 720p when a source without resolution is found

### Technical debt

- Separate data and UI layers in frontend

## 2026-10-11 Subtitles and audio transcoding

### Features

**Ratings**

- The final user can rate movies and TV shows from the media details screen, options are: like, love, dislike, or clear a rating.

**Subtitles**

- The final user can choose the subtitle track through the CC menu in the player screen
- The final user can synchronize the subtitle track through the CC menu in the player screen
- The final user can search for subtitles through the CC menu in the player screen
- Subtitles search through opensubtitles
- Automatically pick up subtitles file present in the same source
- Automatically pick up subtitles embedded in the media file
- Display subtitles natively

**Audio**

- The final user can now choose an audio track through the Audio menu in the player screen
- Incompatible audio codecs are automatically transcoded to a compatible one

**Video**

- The streaming endpoint can automatically search a source with a supported video codec
- The streaming endpoint can automatically transcode the video to a compatible codec (must be eneabled through config)

**Storage**

- The final user can navigate to the storage screen through the navbar
- The final user can free space by deleting media files through the storage screen
- P2P downloads that have been completed for more than 1 hour (configurable) are automatically moved to storage only (they stop contributing to P2P)

**Configuration**

- Configuration screens now highlight missing required settings and service-reported configuration gaps.

### Bug fix

- `127.0.0.1` and `localhost` are now threaded at the same origin

## 2026-10-10 Improved artworks

### Features

- Media-catalog service scans logos and backdrops to find high contrast combinations
- Media-catalog service scans logos to find one with high contrast against a black background (for the hero)

### Bug fix

- TV Shows media card in "Continue watching" now uses the logo image when available

### Technical debt

- Refactored media card to be its own UI component
