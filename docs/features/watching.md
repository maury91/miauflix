# Watching movies and episodes

[Back to all features](../features.md)

Choose a movie or episode and Miauwatch prepares a playable source for your device. A source is a particular copy of the video, which may differ in picture quality, sound, size, or available languages.

## Start watching before the download finishes

Miauwatch downloads media through BitTorrent, which transfers pieces of a file from other people sharing it. It can play the pieces already downloaded while fetching the rest. You do not have to wait for the whole movie or episode to arrive.

Startup time depends on the source, the people sharing it, your connection, and any conversion the server needs to do. A catalog entry alone does not promise immediate playback.

## Watch-once downloads

Turn on **Watch-once downloads** in Preferences for a profile. The setting is per profile and off by default; with it off, downloaded files are kept as before. With it on, Miauwatch waits for the whole file to download before playback starts instead of playing the pieces that have arrived. It then checks that the file has a video extension and that a media probe finds a video stream. A file that fails either check is removed and Miauwatch tries another source. This confirms the file is playable video; it is not antivirus scanning, and no antivirus signatures were added.

When the movie or episode reports that it finished, Miauwatch deletes the file and stops its torrent. Deletion waits while another viewer is streaming the same source, then runs when the last viewer leaves; the wait is bounded, so a stream that never ends can leave the file in place. A file containing several episodes is never deleted per episode: its watch-once claim is used up when one episode ends, but the shared file stays for the other episodes.

There is no rewatch of a deleted file. To see the title again it must be downloaded again from an available source. If you stop before the end, or playback never starts, watch-once does not delete anything; the file keeps following the normal [storage budget and cleanup](storage-privacy.md#automatic-space-management) rules. The feature reuses the existing download container and cleanup path; no second container was added.

## Automatic source selection and fallback

Miauwatch chooses sources using quality, device compatibility, and bitrate preferences. Bitrate is roughly how much video data must arrive each second; a very large file may need a faster connection than a smaller one.

Completed downloads are preferred when suitable, so a title you have already downloaded can start from local storage. If a source is found to be unusable, playback can try another source. These choices are automatic; a quality picker beside Watch Now is still planned.

## Preparation while you browse

While you focus on a title, Miauwatch can begin fetching the information and initial file pieces needed for playback. It also checks audio and local subtitles ahead of time. During playback, it downloads pieces ahead of your current position to reduce interruptions.

## Player controls

The player supports play and pause, seeking to another point, volume controls where supported, and fullscreen. Keyboard and remote-control navigation let you reach player controls without a mouse. On Samsung TVs, the remote controls the TV's volume.

Hover over the seek bar with a mouse to preview the frame at that point. On Samsung TVs, Left or Right pauses the video and shows a strip of frames 10 seconds apart above the seek bar. Further presses move along the strip. OK or Play jumps to the selected frame and plays, and Back closes the strip without seeking. Frames from parts that have not downloaded yet take longer to appear.

Seeking to a part that has not downloaded yet can require more waiting. Sources that need sound or video conversion may restart that conversion at the requested position.

## Resume and Continue watching

Miauwatch saves playback progress for your account. The home screen's Continue watching row offers unfinished movies and shows, and playback can resume near where you stopped. It can also suggest the next episode of a show. Very short starts and completed titles are excluded from the unfinished list.

Progress belongs to the account, so different people can keep separate viewing positions. See the [feature overview](../features.md) for the related account, watchlist, and rating features.

## Skip intro

When a file has an opening chapter such as Intro, Opening, or OP, the player offers **Skip intro** while it plays. Skipping is manual. The opening must start in the first half of the video, have a following chapter, last no more than five minutes, and end before the video ends.

On a keyboard or TV remote, press Down from the video to reach the prompt, then Enter or OK to activate it. Intro, credits, and next-episode prompts sit between the video and seek bar in remote navigation. Focus returns to the video if a focused prompt disappears.

## Next episodes and credits

For TV playback, Miauwatch can prepare the next episode in advance and offer automatic continuation. It recognizes named end-credit chapters, including anime Ending, ED, and Outro chapters in the second half of the video. Without a usable credits marker, it uses a countdown near the final 90 seconds. Skipping to the next episode marks the current one complete; **Stay** cancels the next-episode prompt.

When chapters indicate a scene after the credits, **Skip credits** jumps to that scene after five seconds of playback through the credits. Select **Watch credits** to keep watching them. Seeking into the credits suppresses this automatic skip; seeking back before them allows it again. The next-episode countdown starts no earlier than the chapter where the scene resumes.

These choices use chapter names rather than inspecting the story. Missing or misleading chapter labels can leave scenes undetected; automatic scene analysis remains planned.

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
- [Player](../../frontend/src/features/player/ui/PlayerView.tsx)
- [Player controls](../../frontend/src/features/player/ui/PlayerControls.tsx)
- [Continue watching](../../frontend/src/features/progress/lib/continue-watching.ts)
