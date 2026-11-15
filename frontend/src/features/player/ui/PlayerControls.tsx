import type { PlayerMedia } from '@features/player/lib/avplay-media';
import { downloadedBlocks, type DownloadedRanges } from '@features/player/lib/seek-track';
import type { SubtitleCandidateDto } from '@miauflix/backend';
import { builtForTizen } from '@shared/config/constants';
import {
  Button,
  IconButton,
  Inline,
  Message,
  PlaybackToolbar,
  SeekControl,
  Slider,
} from '@shared/design-system';
import { visuallyHidden } from '@shared/design-system/a11y.css';
import { SurfaceContextProvider } from '@shared/design-system/surface';
import { getKeyboardAction, useKeyboard } from '@shared/hooks/useKeyboard';
import { FocusGroup, useActiveIdWithin, useFocusable, useNavigation } from '@shared/navigation';
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import * as styles from './playerControls.css';
import { type AudioTrack, SubtitleMenu } from './SubtitleMenu';
import type { SubtitleTimingCue } from './SubtitleTiming';

import ArrowLeftIcon from '~icons/mdi/arrow-left';
import FullscreenIcon from '~icons/mdi/fullscreen';
import PauseIcon from '~icons/mdi/pause';
import PlayIcon from '~icons/mdi/play';
import VolumeIcon from '~icons/mdi/volume-high';
import MutedIcon from '~icons/mdi/volume-off';

/** How far Left and Right seek on the video and the seek bar. */
const SEEK_STEP_SECONDS = 10;
/** How long the controls stay up without input while the video plays. */
const HIDE_AFTER_MS = 3000;

/** Navigation IDs of the player's controls, top to bottom. */
const PLAYER_NAV = {
  header: 'player-header',
  back: 'player-back',
  video: 'player-video',
  prompts: 'player-prompts',
  toolbar: 'player-toolbar',
  playPause: 'player-play-pause',
  subtitles: 'player-subtitles',
  fullscreen: 'player-fullscreen',
  mute: 'player-mute',
  volume: 'player-volume',
} as const;

/** Render the playback header with an action returning to details. */
export function PlayerHeader({
  onBack,
  visible = true,
}: {
  onBack: () => void;
  visible?: boolean;
}) {
  return (
    <SurfaceContextProvider value="overMedia">
      <header className={styles.header} data-hidden={visible ? undefined : true}>
        <FocusGroup id={PLAYER_NAV.header} layout="horizontal">
          <Button navId={PLAYER_NAV.back} icon={<ArrowLeftIcon />} onClick={onBack}>
            Back to details
          </Button>
        </FocusGroup>
        <img
          className={styles.logo}
          src={`${import.meta.env.BASE_URL}assets/images/logo.svg`}
          alt="Miauflix logo"
        />
      </header>
    </SurfaceContextProvider>
  );
}

/**
 * Prompts over the video ("Skip intro", "Skip credits", the next episode): the player's own
 * actions, on the design system over media. `layout` places them: `intro` at the bottom end,
 * `group` centred. The first action is the main one.
 */
export function PlayerPrompt({
  label,
  layout,
  children,
}: {
  /** Names a group of actions ("Next episode"). */
  label?: string;
  layout: 'intro' | 'group';
  children: ReactNode;
}) {
  return (
    <div
      className={layout === 'intro' ? styles.skipIntro : styles.promptGroup}
      role={label ? 'group' : undefined}
      aria-label={label}
    >
      <Inline gap="sm" justify={layout === 'intro' ? 'end' : 'center'}>
        {children}
      </Inline>
    </div>
  );
}

function formatTime(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(value / 3600);
  const parts = [Math.floor(value / 60) % 60, value % 60];
  if (hours) parts.unshift(hours);
  return parts.map(part => String(part).padStart(2, '0')).join(':');
}

/**
 * Control the referenced video's playback, seeking, volume, and fullscreen state, on the design
 * system under the player's navigation layer. A remote moves through the header, the video itself
 * (where Confirm plays or pauses and Left/Right seek), the prompts, play/pause (beside the seek bar,
 * which isn't a stop: Left/Right on play/pause seek) and the row of buttons. While the video plays,
 * the controls hide after a few seconds without a key, a pointer move or the subtitle panel open,
 * wherever focus is; paused, they stay. While they are hidden, an arrow shows them with the focus
 * on play/pause (Left/Right also seek); Confirm on a hidden control only shows it (media keys and
 * Back still act).
 */
export function PlayerControls({
  videoRef,
  preparing = false,
  onBack,
  subtitleSearchPreferences,
  subtitleCues,
  subtitleCandidates,
  subtitleConfigured,
  subtitleAvailable,
  subtitleLoading,
  subtitleMessage,
  selectedSubtitleId,
  subtitleOffset,
  onSearchSubtitles,
  onSelectSubtitle,
  onSubtitleOffsetChange,
  subtitlePreferencesKey,
  durationSeconds,
  onSeek,
  pendingPosition,
  audioTracks,
  selectedAudioTrackIndex,
  onSelectAudioTrack,
  downloadedRanges,
  onControlsInsetChange,
  onHeaderInsetChange,
  prompts,
}: {
  videoRef: RefObject<PlayerMedia | null>;
  preparing?: boolean;
  onBack: () => void;
  subtitleSearchPreferences?: { language: string; hearingImpaired: boolean };
  subtitleCues?: SubtitleTimingCue[];
  subtitleCandidates: SubtitleCandidateDto[];
  subtitleConfigured: boolean | null;
  subtitleAvailable: boolean | null;
  subtitleLoading: boolean;
  subtitleMessage: string;
  selectedSubtitleId: string | null;
  subtitleOffset: number;
  onSearchSubtitles: (language: string, hearingImpaired: boolean) => void;
  onSelectSubtitle: (id: string | null) => void;
  onSubtitleOffsetChange: (offset: number) => void;
  subtitlePreferencesKey: string | null;
  durationSeconds?: number;
  onSeek?: (position: number) => void;
  pendingPosition?: number;
  audioTracks?: AudioTrack[];
  selectedAudioTrackIndex?: number;
  onSelectAudioTrack?: (index: number) => void;
  /** Downloaded parts of the file, drawn under the watched part; null when unknown. */
  downloadedRanges?: DownloadedRanges | null;
  /**
   * Pixels the visible controls cover at the bottom of the player, 0 while they are hidden;
   * subtitles move above them.
   */
  onControlsInsetChange?: (pixels: number) => void;
  /** Pixels the visible header (back button, logo) covers at the top, 0 while it is hidden. */
  onHeaderInsetChange?: (pixels: number) => void;
  /**
   * Prompts over the video (PlayerPrompt: "Skip intro", "Skip credits", next episode). A level of
   * their own between the video and the seek bar.
   */
  prompts?: ReactNode;
}) {
  const [paused, setPaused] = useState(true);
  const [mediaReady, setMediaReady] = useState(false);
  const loading = preparing || !mediaReady;
  const [nativePosition, setPosition] = useState(0);
  const position = pendingPosition ?? nativePosition;
  const requestedPosition = useRef(pendingPosition);
  useLayoutEffect(() => {
    requestedPosition.current = pendingPosition;
  }, [pendingPosition]);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [notice, setNotice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const overlay = useRef<HTMLDivElement>(null);
  const navigation = useNavigation();
  const video = useFocusable<HTMLDivElement>(PLAYER_NAV.video);
  const videoFocused = useRef(video.focused);
  videoFocused.current = video.focused;

  // An open subtitle panel keeps the controls up
  const menuOpen = useRef(false);
  // Shown now; hidden after a while without input (paused, `shown` keeps them up regardless)
  const reveal = useCallback(() => {
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!menuOpen.current) setVisible(false);
    }, HIDE_AFTER_MS);
  }, []);
  const onMenuOpenChange = useCallback(
    (open: boolean) => {
      menuOpen.current = open;
      // Closing it starts the wait again
      if (!open) reveal();
    },
    [reveal]
  );

  useEffect(() => {
    const media = videoRef.current;
    if (!media) return;
    const sync = () => {
      setPaused(media.paused);
      setMediaReady(media.readyState >= 2);
      setPosition(media.currentTime);
      setDuration(durationSeconds ?? (Number.isFinite(media.duration) ? media.duration : 0));
      setVolume(media.volume);
      setMuted(media.muted);
    };
    const events = [
      'play',
      'pause',
      'ended',
      'timeupdate',
      'durationchange',
      'volumechange',
      'loadeddata',
      'canplay',
      'emptied',
    ];
    events.forEach(event => media.addEventListener(event, sync));
    sync();
    media.addEventListener('play', reveal);
    reveal();
    return () => {
      events.forEach(event => media.removeEventListener(event, sync));
      media.removeEventListener('play', reveal);
      clearTimeout(timer.current);
    };
  }, [videoRef, reveal, durationSeconds]);

  // The player starts on the video itself (after the commit: a focus change in a layout effect
  // would flush the parent's effects before the session's own updates settle)
  useEffect(() => {
    navigation.focus(PLAYER_NAV.video);
    // Once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const media = videoRef.current;
    if (!media) return;
    if (media.paused) {
      void media
        .play()
        .then(() => setNotice(''))
        .catch(() => setNotice('Playback could not start. Try Play again.'));
    } else media.pause();
    reveal();
  };
  const seek = (value: number) => {
    const media = videoRef.current;
    if (media && duration > 0) {
      const target = Math.min(Math.max(0, duration - 0.1), Math.max(0, value));
      if (onSeek) {
        requestedPosition.current = target;
        setPosition(target);
        onSeek(target);
      } else media.currentTime = target;
    }
    reveal();
  };
  const play = () => {
    if (videoRef.current?.paused) toggle();
    else reveal();
  };
  const pause = () => {
    if (videoRef.current && !videoRef.current.paused) toggle();
    else reveal();
  };

  const shown = visible || paused;

  const seekBy = (delta: number) => {
    // A converted stream restarts asynchronously. Native media exposes its seek target immediately.
    const requested = onSeek ? requestedPosition.current : undefined;
    const base = requested ?? videoRef.current?.currentTime ?? 0;
    seek(base + delta);
  };
  // Play/pause takes the focus once the controls it was hidden with are back (a hidden control
  // can't take DOM focus)
  const [focusPlayWhenShown, setFocusPlayWhenShown] = useState(false);
  const playSlot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusPlayWhenShown || !shown) return;
    setFocusPlayWhenShown(false);
    navigation.focus(PLAYER_NAV.playPause);
    // Already the layer's focus when it hid (hiding dropped its DOM focus): the layer doesn't move
    // to where it is, so give the DOM focus back here
    const button = playSlot.current?.querySelector('button');
    if (button && document.activeElement !== button) button.focus({ preventScroll: true });
    // The store's focus is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPlayWhenShown, shown]);

  // Back to details hiding with the header would drop the DOM focus to the page: the video takes
  // it, so the remote keeps working (Back still leaves through the player's own handler)
  useLayoutEffect(() => {
    if (!shown && navigation.getActiveId() === PLAYER_NAV.back) navigation.focus(PLAYER_NAV.video);
  }, [navigation, shown]);

  // The latest values, for the key listener below
  const keys = useRef({ shown, seekBy, reveal });
  keys.current = { shown, seekBy, reveal };

  /**
   * Any key shows the controls again. On the video and on play/pause, Left and Right seek. While the
   * controls are hidden, every arrow shows them with the focus on play/pause (Left and Right
   * seek too), and Confirm on a hidden control only shows it; on the video it plays or pauses.
   * Registered in a layout effect: those all run before any passive effect, so this listener comes
   * before the controls' own (a focused Slider's), which skip a key it prevented.
   */
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const { shown: controlsShown, seekBy: seekStep, reveal: show } = keys.current;
      const action = getKeyboardAction(event);
      const horizontal = action === 'left' || action === 'right';
      const vertical = action === 'up' || action === 'down';
      if (!controlsShown && (horizontal || vertical)) {
        event.preventDefault();
        show();
        setFocusPlayWhenShown(true);
        if (horizontal) seekStep(action === 'left' ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS);
        return;
      }
      // Play/pause sits beside the seek bar, which the remote doesn't stop on: Left/Right on it seek
      const playFocused = navigation.getActiveId() === PLAYER_NAV.playPause;
      if (horizontal && (videoFocused.current || playFocused)) {
        event.preventDefault();
        seekStep(action === 'left' ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS);
        return;
      }
      if (!controlsShown && action === 'confirm' && !videoFocused.current) {
        // A hidden control keeps focus; the first press only shows it, it doesn't act on it
        event.preventDefault();
        show();
        return;
      }
      show();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // The store's methods are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The remote's media keys work wherever the focus is while the player is open.
  useKeyboard({
    onPlayPause: () => {
      toggle();
      return true;
    },
    onPlay: () => {
      play();
      return true;
    },
    onPause: () => {
      pause();
      return true;
    },
  });

  // A prompt that held the focus can vanish (pressed, or the intro ends): give the focus back to
  // the video, not to whatever the layer finds next, so the remote keeps controlling playback
  const promptsRef = useRef<HTMLDivElement>(null);
  const activeInPrompts = useActiveIdWithin(PLAYER_NAV.prompts);
  const promptHeld = useRef(false);
  useEffect(() => {
    if (activeInPrompts) {
      promptHeld.current = true;
      return;
    }
    if (!promptHeld.current) return;
    promptHeld.current = false;
    if (!promptsRef.current?.querySelector('button')) navigation.focus(PLAYER_NAV.video);
    // The store's focus is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInPrompts]);

  const controls = useRef<HTMLDivElement>(null);
  const onInsetRef = useRef(onControlsInsetChange);
  onInsetRef.current = onControlsInsetChange;
  const onHeaderInsetRef = useRef(onHeaderInsetChange);
  onHeaderInsetRef.current = onHeaderInsetChange;
  // From the bottom of the player to the top of the controls' content
  useLayoutEffect(() => {
    const measure = (): void => {
      const content = controls.current;
      const area = overlay.current?.getBoundingClientRect();
      onInsetRef.current?.(
        shown && content && area
          ? Math.max(0, Math.round(area.bottom - content.getBoundingClientRect().top))
          : 0
      );
      const header = overlay.current?.querySelector('header');
      onHeaderInsetRef.current?.(
        shown && header && area
          ? Math.max(0, Math.round(header.getBoundingClientRect().bottom - area.top))
          : 0
      );
    };
    measure();
    if (!shown) return;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [shown, notice]);
  // A layout cleanup, so a replaced (keyed) instance resets before its successor measures.
  useLayoutEffect(
    () => () => {
      onInsetRef.current?.(0);
      onHeaderInsetRef.current?.(0);
    },
    []
  );

  return (
    <div
      ref={overlay}
      className={styles.overlay}
      data-shown={shown || undefined}
      onPointerMove={reveal}
    >
      <PlayerHeader onBack={onBack} visible={shown} />
      <div
        ref={video.ref}
        className={styles.surface}
        data-paused={paused || undefined}
        tabIndex={0}
        role="button"
        aria-label="Playback controls"
        onMouseMove={video.onMouseMove}
        onClick={toggle}
      />
      <SurfaceContextProvider value="overMedia">
        <FocusGroup id={PLAYER_NAV.prompts} layout="horizontal">
          <div ref={promptsRef}>{prompts}</div>
        </FocusGroup>
      </SurfaceContextProvider>
      <div ref={controls} className={styles.controls}>
        {notice && (
          <div className={styles.notice}>
            <Message tone="danger" toneLabel="Error" variant="banner" live="assertive">
              {notice}
            </Message>
          </div>
        )}
        <PlaybackToolbar
          navId={PLAYER_NAV.toolbar}
          label="Playback toolbar"
          hidden={!shown}
          busyLabel={loading ? 'Preparing playback…' : undefined}
          seek={
            <SeekControl
              label="Seek"
              position={position}
              duration={duration}
              onSeek={seek}
              keyStep={SEEK_STEP_SECONDS}
              valueText={`${formatTime(position)} of ${formatTime(duration)}`}
              elapsedText={formatTime(position)}
              remainingText={formatTime(duration)}
              downloaded={downloadedBlocks(downloadedRanges)}
            />
          }
          primary={
            <div ref={playSlot}>
              <IconButton
                navId={PLAYER_NAV.playPause}
                size="lg"
                label={paused ? 'Play' : 'Pause'}
                icon={paused ? <PlayIcon /> : <PauseIcon />}
                onClick={toggle}
              />
            </div>
          }
          end={
            <Inline gap="sm" align="center">
              <SubtitleMenu
                navId={PLAYER_NAV.subtitles}
                onOpenChange={onMenuOpenChange}
                searchPreferences={subtitleSearchPreferences}
                videoRef={videoRef}
                subtitleCues={subtitleCues}
                pendingPosition={pendingPosition}
                audioTracks={audioTracks}
                selectedAudioTrackIndex={selectedAudioTrackIndex}
                onSelectAudioTrack={onSelectAudioTrack}
                candidates={subtitleCandidates}
                configured={subtitleConfigured}
                available={subtitleAvailable}
                loading={subtitleLoading}
                message={subtitleMessage}
                selectedId={selectedSubtitleId}
                offset={subtitleOffset}
                onSearch={onSearchSubtitles}
                onSelect={onSelectSubtitle}
                onOffsetChange={onSubtitleOffsetChange}
                preferencesKey={subtitlePreferencesKey}
              />
              {/* The remote sets the TV's volume, and the TV app is always full screen */}
              {!builtForTizen && (
                <>
                  <IconButton
                    navId={PLAYER_NAV.fullscreen}
                    size="lg"
                    label="Toggle fullscreen"
                    icon={<FullscreenIcon />}
                    onClick={() => {
                      const request = document.fullscreenElement
                        ? document.exitFullscreen()
                        : videoRef.current?.parentElement?.requestFullscreen();
                      void request?.catch(() =>
                        setNotice('Fullscreen is unavailable in this browser.')
                      );
                    }}
                  />
                  <IconButton
                    navId={PLAYER_NAV.mute}
                    size="lg"
                    label={muted ? 'Unmute' : 'Mute'}
                    icon={muted ? <MutedIcon /> : <VolumeIcon />}
                    onClick={() => {
                      if (videoRef.current) videoRef.current.muted = !muted;
                    }}
                  />
                  {/* Last in the row: while focused, a slider owns Left and Right */}
                  <div className={styles.volume}>
                    {/* Named without a header, so it fits the row */}
                    <span id="player-volume-label" className={visuallyHidden}>
                      Volume
                    </span>
                    <Slider
                      navId={PLAYER_NAV.volume}
                      id="player-volume"
                      aria-labelledby="player-volume-label"
                      min={0}
                      max={1}
                      step={0.05}
                      value={muted ? 0 : volume}
                      valueText={`${Math.round((muted ? 0 : volume) * 100)}%`}
                      onChange={value => {
                        if (videoRef.current) {
                          videoRef.current.volume = value;
                          videoRef.current.muted = false;
                        }
                      }}
                    />
                  </div>
                </>
              )}
            </Inline>
          }
        />
      </div>
    </div>
  );
}
