import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef, useState } from 'react';

import { PlayerControls } from './PlayerControls';

const cues = [
  { start: 0, end: 4, text: 'First subtitle' },
  { start: 5, end: 8, text: 'Next subtitle' },
];

function RemoteSubtitleFlow() {
  const videoRef = useRef<HTMLVideoElement>(null);
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
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: 'black' }}>
      <video ref={videoRef} aria-label="Remote fixture video" />
      {exited ? (
        <p>Returned to details</p>
      ) : (
        <PlayerControls
          videoRef={videoRef}
          durationSeconds={100}
          onBack={() => setExited(true)}
          subtitleSearchPreferences={{ language: 'en', hearingImpaired: false }}
          subtitleCues={selected ? cues : []}
          subtitleCandidates={[
            {
              id: 'english-track',
              provider: 'torrent',
              fileId: '9:sidecar:1',
              language: 'en',
              languageLabel: 'English',
              release: 'root',
              hearingImpaired: false,
              trusted: false,
              match: 'file',
              filenameSimilarity: 100,
            },
          ]}
          subtitleConfigured={false}
          subtitleAvailable={true}
          subtitleLoading={false}
          subtitleMessage=""
          selectedSubtitleId={selected}
          subtitleOffset={offset}
          onSearchSubtitles={() => {}}
          onSelectSubtitle={setSelected}
          onSubtitleOffsetChange={setOffset}
          subtitlePreferencesKey={null}
        />
      )}
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
