# TV remux plan

Status: Phase 1 (audio-only remux, with subtitles extracted) implemented, except the parts listed under [Phase 1: not done yet](#phase-1-not-done-yet); Phase 2 (video re-encode) deferred.

## Why

A Samsung TV plays files through AVPlay, which decodes the video of almost every release but not every audio codec. A file whose only audio is TrueHD or DTS (MobLand S01E01, `HEVC 10-bit + TrueHD 5.1`) is played today through **live conversion**: the backend runs FFmpeg per playback, copies the video and converts the audio to stereo AAC, and the TV plays the result through Media Source Extensions in a `<video>` element. That path:

- loses surround sound (stereo AAC);
- restarts FFmpeg on every seek and track switch;
- depends on the stall watchdog in `audio-playback.ts`, which makes the picture jump on the TV;
- costs CPU on every playback of the same file.

The fix is to convert once, in the background, into a file the TV plays natively, and keep it.

## Measurements

Taken on the production VPS (8 vCPU AMD EPYC 9354P under KVM, no GPU) with MobLand S01E01 (3.80 GB, 58 min 59 s, HEVC 10-bit 1080p, TrueHD 5.1), in throwaway containers from the backend image (FFmpeg 7.1.5).

| Job                                                        | Speed (video seconds per second) | CPU          | Memory                |
| ---------------------------------------------------------- | -------------------------------- | ------------ | --------------------- |
| Copy video, TrueHD → E-AC-3 5.1 640 kbit/s (whole episode) | **20.3×** (175 s for 59 min)     | ~0.9 core    | 62 MB                 |
| Same, capped at 1 core / 0.5 core                          | 18.5× / 9.7×                     | 1 / 0.5 core | 62 MB                 |
| HEVC 10-bit decode only                                    | 5.8×                             | ~3.8 cores   |                       |
| Video re-encode, x264 veryfast CRF 23                      | 3.0×                             | ~4.9 cores   | 709 MB                |
| Video re-encode, x264 veryfast, capped at 2 cores          | ~1.03×                           | 2 cores      | 475 MB (`-threads 2`) |
| Video re-encode, x264 superfast                            | 3.1× (decode-bound)              | ~5.3 cores   |                       |
| Video re-encode, x265 ultrafast                            | 1.15×                            | ~2.4 cores   |                       |

The audio-only remux also shrank the file from 3.80 GB to 2.83 GB (TrueHD dropped).

**Containment.** `--cpus` caps a job exactly (speed scales with the cap). It does not isolate it: a live 10-minute remux took 28–32 s alone, 37 s next to an encode capped at 1 core, 48 s at 2 cores, 62 s at 4, and 64 s next to an uncapped encode given low weight (`--cpu-shares=2`). With 7 cores idle the slowdown is not CPU scheduling but shared memory bandwidth and clock boost on the KVM host. A weight alone never applies here because there is always an idle core. Even the worst case left the live job at 9.7× realtime, so playback is not at risk, and AVPlay direct streams use no CPU.

## Phase 1: audio-only remux (now)

### What gets remuxed

A stored file is remuxed for the TV when its probe (the `media_probe` cache) shows that, for some audio language, no track is in the set every supported TV decodes (`aac`, `ac3`, `eac3`, `mp3`). The output keeps:

- the video stream, copied;
- **one audio track per language**: a compatible track when the file has one (copied, except E-AC-3, which is converted: AVPlay ignores it in MPEG-TS), otherwise the track with the most channels converted to AC-3 (5.1 at 640 kbit/s; 7.1 is downmixed to 5.1, AC-3's limit; stereo and mono at 192 kbit/s), with its language, title and default flag;
- **every subtitle track**, so nothing is lost when the original is deleted:
  - **text and styled tracks as sidecar files**, outside the video stream: text (SubRip, WebVTT, `mov_text`) converted to WebVTT, styled (ASS/SSA) kept as ASS with the release's font attachments, so the player renders them as it does today. Each sidecar's language, title and default, forced and hearing-impaired flags are recorded in the remux's entry in the database, so the player's embedded-subtitle list (`SourceSubtitlesService`) reads that record and never probes the remux;
  - **image tracks (PGS, DVD, DVB) as sidecar files too**, kept as they are: `.sup` for PGS, a one-track Matroska file for DVD and DVB. Nothing in the player shows them today; they are kept so they can be rendered or turned into text (OCR) later, after the original is gone. They are listed in the same record.

**Decided: image subtitles are sidecars (option 1).** HLS cannot carry PGS. Tested with MobLand S01E01's PGS track: FFmpeg's HLS muxer sends every subtitle stream to a WebVTT subtitle playlist and fails on PGS (`webvtt muxer supports only codec webvtt`), with MPEG-TS and fMP4 segments alike. The MPEG-TS muxer itself can carry PGS only in Blu-ray M2TS mode (stream type `0x90`), whose 192-byte packets HLS does not allow. A piped Matroska remux keeps the PGS track (all 67 packets of the first two minutes) but, as above, has no Cues. The choices:

1. **HLS, image tracks as sidecars.** The remux streams while it is built; image tracks are kept as their own files (`.sup` for PGS, a one-track Matroska file for DVD and DVB), playable by nothing today, but kept for later rendering or OCR.
2. **One Matroska file, image tracks inside.** AVPlay gets its chance to render them, but the Matroska muxer writes its index (Cues) only into seekable output, and encrypted storage is fed through a pipe: tested, a piped Matroska remux has no Cues at all, so seeking means scanning. It also cannot be played until it is finished, and needs either a plaintext temporary file (against `storage-privacy.md`) or a seekable writer into the encrypted store.
3. **Both, only when a file has image subtitles.** HLS for playback while building, then a Matroska file with the image tracks, built from the finished HLS. Costs a second copy until one is dropped.

Option 1 was chosen: the remux stays streamable while it is built. Whether AVPlay renders PGS at all can still be checked later, and would only matter for option 2: play an original Matroska file with a PGS track (and audio the TV decodes) through the TV app and turn its subtitles on. If AVPlay does not render it, option 1 loses nothing.

### The original file

The original is kept while it seeds and while the remux is incomplete. Once the remux is complete and verified (every segment and subtitle file written, the playlist's total duration within a second of the original's), the original becomes **evictable first** under storage pressure, and can be deleted outright by a setting. The remux then stands on its own: video, the chosen audio tracks and every subtitle track. Audio tracks dropped by the remux (a second compatible track in a language that already has one) are the only thing lost with the original.

### Where it runs

In **media-load**, which holds the encrypted files, accounts for disk use and evicts. FFmpeg is added to the media-load image, which moved from Alpine to Debian for it: FFmpeg on musl decodes TrueHD 8 to 9 times slower, which held the first real remux (MobLand S01E01) at about 3x real time; on Debian it took 189 s for 59 minutes. The backend keeps deciding _whether_ a file needs a remux (it owns the probes and the TV capabilities) and asks media-load to build one through a new contract call. Input is read through the existing encrypted reader over a loopback URL, as live conversion does today; nothing is written in plaintext.

One remux runs at a time, as a child process at `nice 19` with `-threads 1`, which keeps it to about one core (the measurements above). The queue is ordered by priority (see below). The services run as the `bunqueue` user, which cannot lower a running process's niceness: a remux started for a viewer runs at 0, but one already running when a viewer asks keeps 19, which only matters if the machine is short of idle cores.

### Output: HLS, stored encrypted

A single MKV or MP4 cannot be written into encrypted storage: both muxers seek back to the start of the output when they finish, to write the index (Matroska Cues, MP4 `moov`). Tested: a Matroska remux written to a pipe has **no Cues at all**, so a player can only seek by scanning the file. HLS has no such step: FFmpeg writes finished segments one by one plus a playlist that is the index, and Samsung TVs play HLS natively in AVPlay.

- FFmpeg writes MPEG-TS HLS (6-second segments, `hls_playlist_type event`), uploading each segment and the playlist with HTTP `PUT` to a loopback server inside media-load (`-method PUT`), so no file touches the disk unencrypted.
- Each upload (segment, sidecar) is stored as its own file in the source's storage directory, `remux/<id>/`, encrypted whole with AES-256-GCM under the host's key, under a name keyed by it. Segments are small enough to decrypt whole for a range read; they are not padded. The segment table lives in the media-load database (`remux`, `remux_file`), and the playlist is built from it, listing only stored segments.
- Segment bytes count toward the source's allocated bytes, and the remux is removed with the source, so eviction and the storage limit keep working unchanged. Before FFmpeg starts, the source's reservation grows by the source file's size plus 5% (`StorageService.reserveAdditional`), evicting weaker storage as a download's reservation does (a remux a viewer waits for may evict prefetched storage; any other keeps the playback reserve and evicts only speculative storage); without room the remux fails before writing anything. Once it ends the storage is measured and the unused part of the reservation is given back.
- The backend records each file's versions apart (`media_variant`: the original, and its remux while building and once ready), with the codecs each holds, so source selection judges a source by what it plays as: a source with a usable remux, even one still being built, is not swapped for another release to avoid converting audio.

### Streaming while it is built

Because the playlist is an `EVENT` playlist, a viewer can play a remux that is still being built: it holds every finished segment, and the TV keeps re-reading it. At 20× realtime the remux stays ahead of the viewer after the first seconds. A viewer converting the audio moves to the remux as soon as it is a minute past their saved position. AVPlay plays the open playlist as a live stream (no duration, starting three segments before its end, ignoring `EXT-X-START`), so the player supplies the duration, and the first playlist it gets ends two segments past where playback starts. A seek past the last finished segment lands on the last one AVPlay knows (tested on Tizen 5.5); waiting there for the remux to catch up, or falling back to the original, is not done yet.

### Priority

1. **Being watched**: a viewer opened a session on this file. The job jumps the queue, and the running job is reniced to 0 (still one thread).
2. **Expected next**: the next episode of a show the user is watching, or a watchlist title, once its download completes, so it is ready before the user opens it.
3. **Anything else** that completed downloading and needs it.

A job is dropped when its source is removed, and paused while media-load is short of space.

### Delivery

- A new delivery mode, `remux`, is returned when a finished or in-progress remux exists and the client is AVPlay. Its stream URL is the playlist (`/api/stream/:token/remux/index.m3u8`), whose segment URLs carry the same playback token.
- Track selection, resume position and subtitles behave as with direct play: AVPlay sees one compatible track per language.
- Browsers are unchanged (Chrome does not play HLS without a library), as are TVs where the original already plays directly.
- A source with a remux no longer counts as needing conversion when sources are ranked (see `conversionFreeCandidate` in `PlaybackSessionService`).

### To verify on the TV with the first build

- **Tested on the 2020 Tizen 5.5 TV:** AVPlay never finishes `prepareAsync` on fMP4 HLS, whatever the codecs (H.264 with AAC included), and ignores E-AC-3 in MPEG-TS (stream type `0x87` and DVB `0x06` alike). MPEG-TS HLS with HEVC 10-bit and AC-3 or AAC prepares in under a second and plays, so remuxes are MPEG-TS with AC-3. Still to check: seeking within the remux, and following an open `EVENT` playlist.

### Phase 1: not done yet

- **Deleting or evicting the original** once the remux is complete. Removing a source removes its remux too (the rows cascade from `storage`), so the original stays until this lands.
- **Subtitles from the sidecars.** They are recorded (`RemuxStatus.subtitles`) and served (`/api/stream/:token/remux/s<N>.vtt`), but `SourceSubtitlesService` still reads the original; it switches with the item above.
- **Watchlist titles.** Only a TV's next-episode prefetch requests a `next` remux; the watchlist download job does not know whether its user watches on a TV.
- **Pausing while short of space**, and falling back to the original for a seek past the last finished segment.
- **Checking on the TV** (below): playback, seeking and an open `EVENT` playlist are checked; a full episode switched from converted audio while its remux was built is not yet.

## Phase 2: video re-encode (deferred)

For files whose **video** the TV cannot play as it is: a codec it does not decode (AV1, or HEVC 10-bit on a TV that only does 8-bit), or a bitrate over the TV's limit (`TV_MAX_BITRATE_KBPS`, 8 Mbit/s; a 4K remux runs about 35 Mbit/s).

- **Cost.** HEVC 10-bit 1080p → H.264 runs at about 3× realtime using five of the eight cores, or about realtime capped at two. A movie takes 1–2 hours at the cap. It can only run in the background; it can never serve a viewer live on this machine.
- **Containment.** A dedicated container capped at 2 cores (`--cpus=2`, `-threads 2`, ~0.5 GB memory), one job at a time. Even capped, it slows other CPU work on the host by about 40%, so it pauses while any live conversion runs, and resumes after.
- **Priority** follows Phase 1: a title being watched first (it still cannot keep up live, so the viewer keeps the existing paths until enough is encoded ahead of them), then expected-next titles.
- **Streaming while it is built** uses the same HLS output; at about realtime, a viewer who starts with the encode may catch up with it, and is moved to the original when they do.
- **Prefer a better source first.** Re-encoding is a last resort: source ranking already prefers releases within the TV's bitrate and codecs, and only titles with no such release would need it.
- **Hardware encoding** (VAAPI, Quick Sync, NVENC are built into the FFmpeg package) would change these numbers by an order of magnitude on a self-hosted machine with a GPU; the VPS has none.
