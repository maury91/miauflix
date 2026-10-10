import { PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { Button as BaseButton } from '@shared/ui/button/Button';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import ArrowLeftIcon from '~icons/mdi/arrow-left';
import FullscreenIcon from '~icons/mdi/fullscreen';
import PauseIcon from '~icons/mdi/pause';
import PawIcon from '~icons/mdi/paw';
import VolumeIcon from '~icons/mdi/volume-high';
import MutedIcon from '~icons/mdi/volume-off';
import PlayIcon from '~icons/octicon/play-16';

const Overlay = styled.div<{ $visible: boolean; $paused: boolean }>`
  position: absolute;
  inset: 0;
  color: ${PALETTE.text.primary};
  background: ${({ $paused }) => ($paused ? 'rgba(0, 0, 0, 0.5)' : 'transparent')};
  cursor: ${({ $visible }) => ($visible ? 'default' : 'none')};
`;
const Controls = styled.div<{ $visible: boolean }>`
  position: absolute;
  inset: auto 0 0;
  padding: 5rem 5vw 3vh;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  visibility: ${({ $visible }) => ($visible ? 'visible' : 'hidden')};
  transition: opacity 0.2s;
`;
const Header = styled.header<{ $visible: boolean }>`
  position: absolute;
  top: 3vh;
  left: 5vw;
  right: 5vw;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  visibility: ${({ $visible }) => ($visible ? 'visible' : 'hidden')};
  transition: opacity 0.2s;
  img {
    width: 14.5vh;
    height: 4vh;
  }
`;

// eslint-disable-next-line no-restricted-syntax -- Existing media/player interaction and TV-scaled chrome; see shared/ui/README.md.
const HeaderButton = styled(BaseButton)`
  min-width: auto;
  min-height: 0;
  padding: 0.7rem 1.2rem;
  border: 1px solid ${PALETTE.background.border};
  border-radius: 0.35rem;
  background: ${PALETTE.background.surface2};
  color: ${PALETTE.text.primary};
  font-size: 1rem;
  box-shadow: none;
`;

/** Render the playback header with an action returning to details. */
export function PlayerHeader({
  onBack,
  visible = true,
}: {
  onBack: () => void;
  visible?: boolean;
}) {
  return (
    <Header $visible={visible}>
      <HeaderButton type="button" icon={<ArrowLeftIcon aria-hidden="true" />} onClick={onBack}>
        Back to details
      </HeaderButton>
      <img src="/assets/images/logo.svg" alt="Miauflix logo" />
    </Header>
  );
}

// eslint-disable-next-line no-restricted-syntax -- Existing media/player interaction and TV-scaled chrome; see shared/ui/README.md.
const Button = styled(BaseButton)`
  display: inline-grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: inherit;
  font-size: 1.8rem;
  box-shadow: none;
  cursor: pointer;
  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  &:focus-visible {
    outline: 2px solid white;
    outline-offset: 3px;
  }
`;
// eslint-disable-next-line no-restricted-syntax -- Existing media/player interaction and TV-scaled chrome; see shared/ui/README.md.
const CenterPlay = styled(Button)`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: clamp(3rem, 10vh, 7rem);
  padding: 1rem;

  > svg {
    width: 1em;
    height: 1em;
  }
`;
const Seek = styled.div`
  position: relative;
  margin: 0 16px 1rem;
  height: 32px;
  display: flex;
  align-items: center;
`;
const Track = styled.div<{ $percent: number }>`
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    ${PALETTE.color.brand} ${({ $percent }) => $percent}%,
    #aaa ${({ $percent }) => $percent}%
  );
`;
const Paw = styled(PawIcon)<{ $percent: number }>`
  position: absolute;
  left: ${({ $percent }) => $percent}%;
  top: 50%;
  transform: translate(-50%, -63%);
  color: ${PALETTE.color.brand};
  font-size: 32px;
  pointer-events: none;
`;
const SeekInput = styled.input`
  position: absolute;
  inset: 0;
  width: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
  &:focus-visible + svg {
    filter: drop-shadow(0 0 3px white);
  }
`;
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-variant-numeric: tabular-nums;
`;
const Time = styled.span`
  flex: 1;
  font-size: clamp(0.8rem, 2.5vh, 1.2rem);
`;
const Volume = styled.input`
  width: clamp(50px, 8vw, 110px);
  accent-color: ${PALETTE.color.brand};
`;

function formatTime(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(value / 3600);
  const parts = [Math.floor(value / 60) % 60, value % 60];
  if (hours) parts.unshift(hours);
  return parts.map(part => String(part).padStart(2, '0')).join(':');
}

/**
 * Control the referenced video’s playback, seeking, volume, and fullscreen state.
 * Keyboard confirm and ten-second seeks apply when the overlay itself has focus.
 * Controls stay visible while paused; play/fullscreen failures appear as notices.
 */
export function PlayerControls({
  videoRef,
  onBack,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  onBack: () => void;
}) {
  const [paused, setPaused] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [notice, setNotice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const overlay = useRef<HTMLDivElement>(null);

  const reveal = useCallback(() => {
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (
        document.activeElement === overlay.current ||
        !overlay.current?.contains(document.activeElement)
      )
        setVisible(false);
    }, 3000);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      setPaused(video.paused);
      setPosition(video.currentTime);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const events = ['play', 'pause', 'ended', 'timeupdate', 'durationchange', 'volumechange'];
    events.forEach(event => video.addEventListener(event, sync));
    sync();
    overlay.current?.focus({ preventScroll: true });
    video.addEventListener('play', reveal);
    reveal();
    return () => {
      events.forEach(event => video.removeEventListener(event, sync));
      video.removeEventListener('play', reveal);
      clearTimeout(timer.current);
    };
  }, [videoRef, reveal]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video
        .play()
        .then(() => setNotice(''))
        .catch(() => setNotice('Playback could not start. Try Play again.'));
    } else video.pause();
    reveal();
  };
  const seek = (value: number) => {
    const video = videoRef.current;
    if (video && duration > 0) video.currentTime = Math.min(duration, Math.max(0, value));
    reveal();
  };
  const navigationRef = useKeyboardNavigation({
    onConfirm: event => {
      if (event.target !== overlay.current) return false;
      toggle();
      return true;
    },
    onLeft: event => {
      if (event.target !== overlay.current) return false;
      seek(position - 10);
      return true;
    },
    onRight: event => {
      if (event.target !== overlay.current) return false;
      seek(position + 10);
      return true;
    },
  });
  const shown = visible || paused;
  const percent = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;

  return (
    <Overlay
      ref={node => {
        overlay.current = node;
        navigationRef(node);
      }}
      $visible={shown}
      $paused={paused}
      onPointerMove={reveal}
      onClick={event => {
        if (event.target === event.currentTarget) toggle();
      }}
      onFocus={reveal}
      tabIndex={0}
      aria-label="Playback controls"
    >
      <PlayerHeader onBack={onBack} visible={shown} />
      {paused && (
        <CenterPlay type="button" aria-label="Resume playback" onClick={toggle}>
          <PlayIcon aria-hidden="true" />
        </CenterPlay>
      )}
      <Controls $visible={shown}>
        {notice && <p role="alert">{notice}</p>}
        <Seek>
          <Track $percent={percent} />
          <SeekInput
            type="range"
            min={0}
            max={duration || 0}
            step={1}
            value={position}
            disabled={!duration}
            aria-label="Seek"
            aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}
            onChange={event => seek(Number(event.target.value))}
          />
          <Paw $percent={percent} aria-hidden="true" />
        </Seek>
        <Row>
          <Button type="button" aria-label={paused ? 'Play' : 'Pause'} onClick={toggle}>
            {paused ? <PlayIcon aria-hidden="true" /> : <PauseIcon aria-hidden="true" />}
          </Button>
          <Time>
            {formatTime(position)} / {formatTime(duration)}
          </Time>
          <Button
            type="button"
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={() => {
              if (videoRef.current) videoRef.current.muted = !muted;
            }}
          >
            {muted ? <MutedIcon aria-hidden="true" /> : <VolumeIcon aria-hidden="true" />}
          </Button>
          <Volume
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label="Volume"
            onChange={event => {
              if (videoRef.current) {
                videoRef.current.volume = Number(event.target.value);
                videoRef.current.muted = false;
              }
            }}
          />
          <Button
            type="button"
            aria-label="Toggle fullscreen"
            onClick={() => {
              const request = document.fullscreenElement
                ? document.exitFullscreen()
                : videoRef.current?.parentElement?.requestFullscreen();
              void request?.catch(() => setNotice('Fullscreen is unavailable in this browser.'));
            }}
          >
            <FullscreenIcon aria-hidden="true" />
          </Button>
        </Row>
      </Controls>
    </Overlay>
  );
}
