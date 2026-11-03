# Watching movies and episodes

[Back to all features](../features.md)

Choose a movie or episode and Miauflix prepares a playable source for your device. A source is a particular copy of the video, which may differ in picture quality, sound, size, or available languages.

## Start watching before the download finishes

Miauflix downloads media through BitTorrent, which transfers pieces of a file from other people sharing it. It can play the pieces already downloaded while fetching the rest. You do not have to wait for the whole movie or episode to arrive.

Startup time depends on the source, the people sharing it, your connection, and any conversion the server needs to do. A catalog entry alone does not promise immediate playback.

## Automatic source selection and fallback

Miauflix chooses sources using quality, device compatibility, and bitrate preferences. Bitrate is roughly how much video data must arrive each second; a very large file may need a faster connection than a smaller one.

Completed downloads are preferred when suitable, so a title you have already downloaded can start from local storage. If a source is found to be unusable, playback can try another source. These choices are automatic; a quality picker beside Watch Now is still planned.

## Preparation while you browse

While you focus on a title, Miauflix can begin fetching the information and initial file pieces needed for playback. It also checks audio and local subtitles ahead of time. During playback, it downloads pieces ahead of your current position to reduce interruptions.

## Player controls

The player supports play and pause, seeking to another point, volume controls where supported, and fullscreen. Keyboard and remote-control navigation let you reach player controls without a mouse. On Samsung TVs, the remote controls the TV's volume.

Seeking to a part that has not downloaded yet can require more waiting. Sources that need sound or video conversion may restart that conversion at the requested position.

## Resume and Continue watching

Miauflix saves playback progress for your account. The home screen's Continue watching row offers unfinished movies and shows, and playback can resume near where you stopped. It can also suggest the next episode of a show. Very short starts and completed titles are excluded from the unfinished list.

Progress belongs to the account, so different people can keep separate viewing positions. See the [feature overview](../features.md) for the related account, watchlist, and rating features.

## Next episodes and credits

For TV playback, Miauflix can prepare the next episode in advance and offer automatic continuation. It uses a named end-credit chapter when the source provides one; otherwise it uses a countdown near the final 90 seconds. Skipping to the next episode marks the current one complete.

This is not a detector that understands every movie or episode's story. A scene during or after the credits can still matter.

## Planned improvements

The following items are listed in [ToDo.md](../../ToDo.md), with no release date promised:

- **A quality picker beside Watch Now:** choose a quality yourself instead of relying on automatic selection.
- **A clearer quality badge:** show the highest available quality on the source indicator.
- **Accurate combined-episode playback:** handle a single video containing two or more broadcast episodes, with correct episode boundaries, resume positions, and subtitles. A season pack containing separate episode files is a different case and is already supported.
- **Smarter credits handling:** investigate credit detection and scenes during or after credits before using them for automatic transitions.
- **More end-to-end testing:** cover shared season packs, subtitles, playback reattachment, competing storage demands, notification focus, and cancelling the next-episode countdown. This is verification work, not an additional viewing feature.

## Implementation references

- [Streaming and seeking](../../backend/src/routes/stream.routes.ts)
- [Playback sessions and preparation](../../backend/src/services/playback/playback-session.service.ts)
- [Player](../../frontend/src/pages/home/components/PlayerView.tsx)
- [Player controls](../../frontend/src/pages/home/components/PlayerControls.tsx)
- [Continue watching](../../frontend/src/pages/home/continue-watching.ts)
