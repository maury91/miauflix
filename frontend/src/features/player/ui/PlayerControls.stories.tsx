import type { AudioSourceDto } from '@miauwatch/backend';
import { FocusScope, NavigationProvider } from '@shared/navigation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { PlayerControls } from './PlayerControls';

/** The player's navigation layer, as PlayerView provides it. */
const PlayerScope = ({ children }: { children: ReactNode }) => (
  <NavigationProvider>
    <FocusScope id="player">{children}</FocusScope>
  </NavigationProvider>
);

const cues = [
  { start: 0, end: 4, text: 'First subtitle' },
  { start: 5, end: 8, text: 'Next subtitle' },
];

const track = (
  id: string,
  provider: 'embedded' | 'torrent' | 'opensubtitles',
  language: string,
  languageLabel: string,
  release = 'root'
) => ({
  id,
  provider,
  fileId: id,
  language,
  languageLabel,
  release,
  hearingImpaired: false,
  trusted: false,
  match: 'file' as const,
  filenameSimilarity: 100,
});

const subtitleTracks = [
  track('english-track', 'torrent', 'en', 'English'),
  track('lithuanian-track', 'torrent', 'lt', 'Lithuanian'),
  track('english-embedded', 'embedded', 'en', 'English'),
  track('english-online', 'opensubtitles', 'en', 'English', 'Example.Movie.2024.1080p.WEB'),
];

function RemoteSubtitleFlow() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [player, setPlayer] = useState<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [exited, setExited] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const track = video.textTracks[0] ?? video.addTextTrack('subtitles', 'English', 'en');
    track.mode = selected ? 'showing' : 'disabled';
    for (const cue of Array.from(track.cues ?? [])) track.removeCue(cue);
    for (const cue of cues)
      track.addCue(new VTTCue(cue.start + offset, cue.end + offset, cue.text));
  }, [selected, offset]);
  return (
    <div
      ref={setPlayer}
      style={{ position: 'relative', width: '100vw', height: '100vh', background: 'black' }}
    >
      <video ref={videoRef} aria-label="Remote fixture video" />
      {exited ? (
        <p>Returned to details</p>
      ) : (
        <PlayerScope>
          <PlayerControls
            videoRef={videoRef}
            durationSeconds={100}
            onBack={() => setExited(true)}
            subtitleSearchPreferences={{ language: 'en', hearingImpaired: false }}
            subtitleCues={selected ? cues : []}
            subtitleCandidates={subtitleTracks}
            subtitleConfigured={false}
            subtitleAvailable={true}
            subtitleLoading={false}
            subtitleMessage=""
            selectedSubtitleId={selected}
            subtitleOffset={offset}
            onSearchSubtitles={() => {}}
            onSelectSubtitle={setSelected}
            onShowSubtitleLanguage={language =>
              setSelected(
                subtitleTracks.find(
                  candidate => candidate.language === language && candidate.provider === 'torrent'
                )?.id ?? null
              )
            }
            onSubtitleOffsetChange={setOffset}
            subtitlePreferencesKey={null}
            subtitleDefaultLanguage="en"
            overlayContainer={player}
          />
        </PlayerScope>
      )}
    </div>
  );
}

const audioTracks = [
  { language: 'eng', channels: 6 },
  { language: 'eng', channels: 2 },
  { language: 'lit', channels: 6 },
  { language: 'pol', channels: 6 },
  { language: 'ita', channels: 6 },
  { language: 'fre', channels: 6 },
].map((track, index) => ({
  ...track,
  index,
  title: null,
  codec: 'aac',
  isDefault: index === 0,
}));

const audioSource = (id: number, overrides: Partial<AudioSourceDto>): AudioSourceDto => ({
  id,
  quality: 'FHD' as AudioSourceDto['quality'],
  sourceType: 'WEB' as AudioSourceDto['sourceType'],
  videoCodec: 'X264' as AudioSourceDto['videoCodec'],
  size: 2.4 * 1024 ** 3,
  broadcasters: 20,
  releaseLanguages: [],
  audioTracks: null,
  ...overrides,
});

const knownSources = [
  audioSource(1, { releaseLanguages: ['en'] }),
  audioSource(2, {
    audioTracks: [{ language: 'lit', title: null, codec: 'aac', channels: 6 }],
  }),
  audioSource(3, {
    quality: 'HD' as AudioSourceDto['quality'],
    size: 1.1 * 1024 ** 3,
    releaseLanguages: ['lt'],
  }),
  audioSource(4, { releaseLanguages: ['it'] }),
];

/** The audio panel: the file's tracks, and sources in other languages to search and play. */
function AudioFlow() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [player, setPlayer] = useState<HTMLDivElement | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [sourceId, setSourceId] = useState(1);
  const [searching, setSearching] = useState(false);
  const [sources, setSources] = useState(knownSources);
  return (
    <div
      ref={setPlayer}
      style={{ position: 'relative', width: '100vw', height: '100vh', background: 'black' }}
    >
      <video ref={videoRef} aria-label="Audio fixture video" />
      <PlayerScope>
        <PlayerControls
          videoRef={videoRef}
          durationSeconds={100}
          onBack={() => {}}
          subtitleCandidates={[]}
          subtitleConfigured={false}
          subtitleAvailable={false}
          subtitleLoading={false}
          subtitleMessage=""
          selectedSubtitleId={null}
          subtitleOffset={0}
          onSearchSubtitles={() => {}}
          onSelectSubtitle={() => {}}
          onSubtitleOffsetChange={() => {}}
          subtitlePreferencesKey={null}
          overlayContainer={player}
          audioTracks={audioTracks}
          selectedAudioTrackIndex={trackIndex}
          onSelectAudioTrack={setTrackIndex}
          audioMenu={{
            originalLanguage: 'en',
            defaultLanguage: 'en',
            sources,
            currentSourceId: sourceId,
            searching,
            onSearch: language => {
              setSearching(true);
              setTimeout(() => {
                setSearching(false);
                setSources(current => [
                  ...current,
                  audioSource(10 + current.length, { releaseLanguages: [language] }),
                ]);
              }, 1500);
            },
            onPlaySource: id => setTimeout(() => setSourceId(id), 1000),
          }}
        />
      </PlayerScope>
    </div>
  );
}

/** A download arriving while 30% is watched: the stretches grow every second. */
function DownloadingFlow() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ranges, setRanges] = useState<Array<[number, number]>>([
    [0, 120],
    [300, 340],
    [700, 720],
  ]);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setRanges(current =>
          current.map(([start, end]) => [start, Math.min(1000, end + 15)] as [number, number])
        ),
      1_000
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: 'black' }}>
      <video ref={videoRef} aria-label="Downloading fixture video" />
      <PlayerScope>
        <PlayerControls
          videoRef={videoRef}
          durationSeconds={100}
          pendingPosition={30}
          onBack={() => {}}
          subtitleCandidates={[]}
          subtitleConfigured={false}
          subtitleAvailable={false}
          subtitleLoading={false}
          subtitleMessage=""
          selectedSubtitleId={null}
          subtitleOffset={0}
          onSearchSubtitles={() => {}}
          onSelectSubtitle={() => {}}
          onSubtitleOffsetChange={() => {}}
          subtitlePreferencesKey={null}
          downloadedRanges={ranges}
        />
      </PlayerScope>
    </div>
  );
}

/** Answers the player's thumbnail requests with a drawn frame showing its time, like the backend's. */
function useFakeThumbnails() {
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (!url.pathname.endsWith('/thumbnail')) return original(input, init);
      const seconds = Number(url.searchParams.get('t'));
      // A moment to load, as FFmpeg takes
      await new Promise(resolve => setTimeout(resolve, 250));
      init?.signal?.throwIfAborted();
      const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="216"><rect width="384" height="216" fill="hsl(${(seconds * 3) % 360} 45% 35%)"/><text x="192" y="120" font-size="48" font-family="sans-serif" fill="white" text-anchor="middle">${label}</text></svg>`;
      return new Response(new Blob([svg], { type: 'image/svg+xml' }));
    };
    return () => {
      window.fetch = original;
    };
  }, []);
}

/**
 * Seek previews. `strip` (the TV): Left/Right on the video or play/pause opens five frames 10 s
 * apart above the bar; Enter seeks there, Escape (Back) closes it. `hover` (the web): a mouse over
 * the seek bar shows the frame there.
 */
function SeekPreviewFlow({ seekPreview }: { seekPreview: 'strip' | 'hover' }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useFakeThumbnails();
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: 'black' }}>
      <video ref={videoRef} aria-label="Seek preview fixture video" />
      <PlayerScope>
        <PlayerControls
          videoRef={videoRef}
          durationSeconds={1400}
          onBack={() => {}}
          subtitleCandidates={[]}
          subtitleConfigured={false}
          subtitleAvailable={false}
          subtitleLoading={false}
          subtitleMessage=""
          selectedSubtitleId={null}
          subtitleOffset={0}
          onSearchSubtitles={() => {}}
          onSelectSubtitle={() => {}}
          onSubtitleOffsetChange={() => {}}
          subtitlePreferencesKey={null}
          thumbnailSource="/api/stream/fixture"
          seekPreview={seekPreview}
        />
      </PlayerScope>
    </div>
  );
}

const meta = {
  title: 'Home/Player controls',
  component: RemoteSubtitleFlow,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof RemoteSubtitleFlow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RemoteSubtitles: Story = {};
export const DownloadedPieces: Story = { render: () => <DownloadingFlow /> };
export const AudioPanel: Story = { render: () => <AudioFlow /> };
export const SeekPreviewStrip: Story = {
  render: () => <SeekPreviewFlow seekPreview="strip" />,
};
export const SeekPreviewHover: Story = {
  render: () => <SeekPreviewFlow seekPreview="hover" />,
};
