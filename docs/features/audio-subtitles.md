# Sound, languages, and subtitles

[Back to all features](../features.md)

Different video files contain different kinds of sound and subtitles. Miauflix checks what your device can play and adapts delivery where supported.

## Audio-track selection

A video can contain several audio tracks, such as different languages or a commentary track. Miauflix can expose those tracks for selection and uses the languages reported by your browser when choosing an initial track. The choices depend on what the source actually contains.

## Sound conversion for your device

Some files use sound formats that a browser cannot play. When needed, Miauflix converts the selected audio track to stereo AAC, a widely supported format, while streaming. This processing happens on your server.

When the sound already works on your device, Miauflix can keep it unchanged. It can also put compatible video and audio into a different container, like moving the same contents into a different package, without re-encoding them. This avoids unnecessary conversion.

## Video compatibility

HEVC, also called H.265, is a video format supported by some devices but not others. Miauflix can deliver it unchanged to compatible devices, including supported Samsung TV playback.

An optional server setting allows HEVC conversion to H.264 for devices that need it. This is disabled by default and is limited to 1080p at 30 frames per second. Conversion uses server processing power; it is not a promise that every file will play on every device. When HEVC cannot be delivered and conversion is disabled, Miauflix can look for a compatible H.264 source instead.

## Subtitles already in the download

Miauflix automatically looks for text subtitles embedded inside a video and matching subtitle files included in the torrent. Supported separate files include SRT, VTT, ASS, and SSA.

The server converts selected local text subtitles into WebVTT for the player. This works without an OpenSubtitles account or API key, for movies and episodes. Subtitles stored as pictures, including PGS and VobSub, are not currently converted.

In the browser, styled ASS and SSA subtitles, which most anime releases use, are drawn in full instead: signs translated in place, positions, colours, karaoke effects and the fonts the release carries. They are drawn where their authors placed them, so they stay put while the player controls are open. The TV app, and browsers that cannot run the renderer, show these subtitles as plain text in the release's dialogue font.

## OpenSubtitles search

For movies, Miauflix can search OpenSubtitles for additional subtitles when the administrator configures an API key. The movie needs an IMDb identifier for this search. OpenSubtitles search for TV episodes is not implemented; episodes can still use the local subtitle options described above.

## Subtitle preferences and timing

The player lets you choose a subtitle language and adjust its timing if the words appear too early or too late. It also supports a hearing-impaired preference, for subtitles that include information such as sound effects when available.

Subtitle choices and timing are remembered for the account and title. Moving to another point in the video also updates the subtitle delivery so it follows the new playback position. Preferred languages are easier to find, with other languages grouped separately in the menu.

## Planned improvements

[ToDo.md](../../ToDo.md) calls for an account-facing place to choose default audio and subtitle languages, and whether subtitles should turn on automatically. The existing player selections and remembered title preferences do not yet provide that complete settings page.

Automatic subtitle translation and language-learning subtitles are also planned. They are not part of the current subtitle player; see the future language features in the [feature overview](../features.md).

## Implementation references

- [Audio inspection and conversion](../../backend/src/services/playback/audio-playback.service.ts)
- [Local subtitle discovery](../../backend/src/services/subtitles/torrent-subtitles.service.ts)
- [OpenSubtitles integration](../../backend/src/services/subtitles/subtitles.service.ts)
- [Subtitle controls](../../frontend/src/pages/home/components/SubtitleMenu.tsx)
- [Audio language matching](../../frontend/src/features/player/lib/audio-language.ts)
