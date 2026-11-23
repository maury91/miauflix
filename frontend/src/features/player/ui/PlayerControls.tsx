import type { PlayerMedia } from '@features/player/lib/avplay-media';
import {
  firstStripStop,
  lastGridStop,
  SeekThumbnailLoader,
  THUMBNAIL_STEP_SECONDS,
} from '@features/player/lib/seek-thumbnails';
import { downloadedBlocks, type DownloadedRanges } from '@features/player/lib/seek-track';
import type { SubtitleCandidateDto } from '@miauwatch/backend';
import { brandLogoUrl } from '@shared/brand/logo/brandLogo';
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
import { useT } from '@shared/i18n';
import { FocusGroup, useActiveIdWithin, useFocusable, useNavigation } from '@shared/navigation';
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AudioMenu, type AudioMenuProps, type AudioTrack } from './AudioMenu';
import * as styles from './playerControls.css';
import { SeekThumbnailBubble, SeekThumbnailStrip } from './SeekThumbnails';
import { SubtitleMenu } from './SubtitleMenu';
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
  audio: 'player-audio',
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
  const t = useT();
  return (
    <SurfaceContextProvider value="overMedia">
      <header className={styles.header} data-hidden={visible ? undefined : true}>
        <FocusGroup id={PLAYER_NAV.header} layout="horizontal">
          <Button navId={PLAYER_NAV.back} icon={<ArrowLeftIcon />} onClick={onBack}>
            {t('player.backToDetails')}
          </Button>
        </FocusGroup>
        <img className={styles.logo} src={brandLogoUrl} alt={t('player.logo')} />
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
 *
 * Seeking with the remote differs on the TV (`seekPreview="strip"`): the first Left/Right pauses
 * the video and opens a strip of frames on the 10-second grid at the nearest moment that way, the
 * next ones move along it, Confirm or Play seeks there and plays, and Back closes it where the video
 * was. Nothing seeks until then, so a run of presses costs one seek. On the web a mouse hovering the
 * seek bar previews the frame there instead.
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
  onShowSubtitleLanguage,
  onSubtitleOffsetChange,
  subtitlePreferencesKey,
  subtitleDefaultLanguage,
  overlayContainer,
  durationSeconds,
  onSeek,
  pendingPosition,
  audioTracks,
  selectedAudioTrackIndex,
  onSelectAudioTrack,
  audioMenu,
  downloadedRanges,
  onControlsInsetChange,
  onHeaderInsetChange,
  prompts,
  languageButtons,
  thumbnailSource,
  seekPreview = builtForTizen ? 'strip' : 'hover',
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
  /** Shows subtitles in a language (a track at hand, else one searched for). */
  onShowSubtitleLanguage?: (language: string, hearingImpaired: boolean) => void;
  onSubtitleOffsetChange: (offset: number) => void;
  subtitlePreferencesKey: string | null;
  /** The profile's subtitle language for the title, marked Default in the subtitle panel. */
  subtitleDefaultLanguage?: string;
  /** The player element the subtitle panel is drawn over (it is the full-screen element too). */
  overlayContainer?: HTMLElement | null;
  durationSeconds?: number;
  /** Seeks the converted stream; `play` asks for playback afterwards whatever it was before. */
  onSeek?: (position: number, play?: boolean) => void;
  pendingPosition?: number;
  audioTracks?: AudioTrack[];
  selectedAudioTrackIndex?: number;
  onSelectAudioTrack?: (index: number) => void;
  /** The audio panel's sources and actions; without it the panel isn't offered. */
  audioMenu?: Omit<
    AudioMenuProps,
    'navId' | 'container' | 'tracks' | 'selectedTrackIndex' | 'onSelectTrack'
  >;
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
  /** The ways to watch (LanguageButtons), at the start of the row under the seek bar. */
  languageButtons?: ReactNode;
  /** The session's stream URL, whose seek thumbnails are shown; without it there are none. */
  thumbnailSource?: string;
  /** How seeking previews frames: the remote's strip (TV) or a frame over the hovered bar (web). */
  seekPreview?: 'strip' | 'hover';
}) {
  const t = useT();
  const [paused, setPaused] = useState(true);
  const [mediaReady, setMediaReady] = useState(false);
  const loading = preparing || !mediaReady;
  const [nativePosition, setPosition] = useState(0);
  /** The TV's seek preview while open: the selected moment, and whether to play on if cancelled. */
  const [strip, setStrip] = useState<{ at: number; resume: boolean } | null>(null);
  const stripRef = useRef(strip);
  const updateStrip = (next: { at: number; resume: boolean } | null) => {
    // Read again by the next key press before React renders
    stripRef.current = next;
    setStrip(next);
  };
  const position = strip?.at ?? pendingPosition ?? nativePosition;
  const thumbnails = useMemo(
    () => (thumbnailSource ? new SeekThumbnailLoader(thumbnailSource) : null),
    [thumbnailSource]
  );
  useEffect(() => () => thumbnails?.dispose(), [thumbnails]);
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

  // An open panel (subtitles, audio) keeps the controls up
  const menuOpen = useRef(false);
  // Shown now; hidden after a while without input (paused, `shown` keeps them up regardless)
  const reveal = useCallback(() => {
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!menuOpen.current && !stripRef.current) setVisible(false);
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
    // A pointer playing or pausing leaves the seek preview where the video is
    if (stripRef.current) {
      stripRef.current = null;
      setStrip(null);
    }
    if (media.paused) {
      void media
        .play()
        .then(() => setNotice(''))
        .catch(() => setNotice(t('player.playFailed')));
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
  /** One remote step: along the strip (TV), else a seek by SEEK_STEP_SECONDS. */
  const stepStrip = (direction: 1 | -1) => {
    const media = videoRef.current;
    if (!media || duration <= 0) return;
    const open = stripRef.current;
    if (open) {
      const at = Math.min(
        lastGridStop(duration),
        Math.max(0, open.at + direction * THUMBNAIL_STEP_SECONDS)
      );
      updateStrip({ ...open, at });
    } else {
      const requested = onSeek ? requestedPosition.current : undefined;
      const resume = !media.paused;
      if (resume) media.pause();
      updateStrip({
        at: firstStripStop(requested ?? media.currentTime, direction, duration),
        resume,
      });
    }
    reveal();
  };
  /**
   * Confirm or Play on the strip: close it, show the chosen moment on the bar, then seek there and
   * play. AVPlay's seek blocks the page until the bytes there arrive (seconds, for a part not yet
   * downloaded), so it waits until the closed strip is on screen instead of freezing it there.
   */
  const commitStrip = () => {
    const open = stripRef.current;
    if (!open) return;
    updateStrip(null);
    if (onSeek) requestedPosition.current = open.at;
    setPosition(open.at);
    reveal();
    // After the next paint: the frame that already shows the strip closed
    requestAnimationFrame(() =>
      setTimeout(() => {
        const media = videoRef.current;
        if (!media) return;
        if (onSeek) onSeek(open.at, true);
        else {
          media.currentTime = open.at;
          void media
            .play()
            .then(() => setNotice(''))
            .catch(() => setNotice(t('player.playFailed')));
        }
      }, 0)
    );
  };
  /** Back on the strip: close it without seeking, playing on if it was playing. */
  const cancelStrip = () => {
    const open = stripRef.current;
    if (!open) return;
    updateStrip(null);
    if (open.resume) void videoRef.current?.play().catch(() => setNotice(t('player.playFailed')));
    reveal();
  };
  const stripMode = seekPreview === 'strip';
  const step = (direction: 1 | -1) =>
    stripMode ? stepStrip(direction) : seekBy(direction * SEEK_STEP_SECONDS);

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
  const keys = useRef({ shown, step, reveal, commitStrip, cancelStrip });
  keys.current = { shown, step, reveal, commitStrip, cancelStrip };

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
      const { shown: controlsShown, step: seekStep, reveal: show } = keys.current;
      const action = getKeyboardAction(event);
      const horizontal = action === 'left' || action === 'right';
      const vertical = action === 'up' || action === 'down';
      // The open strip has the remote: nothing else (the focused control, Back) sees its keys
      if (stripRef.current && action) {
        const own =
          horizontal ||
          vertical ||
          action === 'confirm' ||
          action === 'play' ||
          action === 'playPause' ||
          action === 'back';
        if (own) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        if (horizontal) seekStep(action === 'left' ? -1 : 1);
        else if (action === 'confirm' || action === 'play' || action === 'playPause')
          keys.current.commitStrip();
        else if (action === 'back') keys.current.cancelStrip();
        else show();
        return;
      }
      if (!controlsShown && (horizontal || vertical)) {
        event.preventDefault();
        show();
        setFocusPlayWhenShown(true);
        if (horizontal) seekStep(action === 'left' ? -1 : 1);
        return;
      }
      // Play/pause sits beside the seek bar, which the remote doesn't stop on: Left/Right on it seek
      const playFocused = navigation.getActiveId() === PLAYER_NAV.playPause;
      if (horizontal && (videoFocused.current || playFocused)) {
        event.preventDefault();
        seekStep(action === 'left' ? -1 : 1);
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
  const stripOpen = strip !== null;
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
  }, [shown, notice, stripOpen]);
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
        aria-label={t('player.controls')}
        onMouseMove={video.onMouseMove}
        onClick={toggle}
      />
      <SurfaceContextProvider value="overMedia">
        <FocusGroup id={PLAYER_NAV.prompts} layout="horizontal">
          <div ref={promptsRef}>{prompts}</div>
        </FocusGroup>
      </SurfaceContextProvider>
      <div ref={controls} className={styles.controls}>
        {strip && thumbnails && (
          <SeekThumbnailStrip loader={thumbnails} selected={strip.at} duration={duration} />
        )}
        {notice && (
          <div className={styles.notice}>
            <Message tone="danger" toneLabel={t('common.error')} variant="banner" live="assertive">
              {notice}
            </Message>
          </div>
        )}
        <PlaybackToolbar
          navId={PLAYER_NAV.toolbar}
          label={t('player.toolbar')}
          hidden={!shown}
          busyLabel={loading ? t('player.preparing') : undefined}
          seek={
            <SeekControl
              label={t('player.seek')}
              position={position}
              duration={duration}
              onSeek={seek}
              keyStep={SEEK_STEP_SECONDS}
              valueText={t('player.timeOf', {
                position: formatTime(position),
                duration: formatTime(duration),
              })}
              elapsedText={formatTime(position)}
              remainingText={formatTime(duration)}
              downloaded={downloadedBlocks(downloadedRanges)}
              hoverPreview={
                seekPreview === 'hover' && thumbnails
                  ? seconds => (
                      <SeekThumbnailBubble
                        loader={thumbnails}
                        seconds={seconds}
                        time={formatTime(seconds)}
                      />
                    )
                  : undefined
              }
            />
          }
          primary={
            <div ref={playSlot}>
              <IconButton
                navId={PLAYER_NAV.playPause}
                size="lg"
                label={paused ? t('player.play') : t('player.pause')}
                icon={paused ? <PlayIcon /> : <PauseIcon />}
                onClick={toggle}
              />
            </div>
          }
          start={languageButtons}
          end={
            <Inline gap="sm" align="center">
              <SubtitleMenu
                navId={PLAYER_NAV.subtitles}
                onOpenChange={onMenuOpenChange}
                searchPreferences={subtitleSearchPreferences}
                videoRef={videoRef}
                subtitleCues={subtitleCues}
                pendingPosition={pendingPosition}
                candidates={subtitleCandidates}
                configured={subtitleConfigured}
                available={subtitleAvailable}
                loading={subtitleLoading}
                message={subtitleMessage}
                selectedId={selectedSubtitleId}
                offset={subtitleOffset}
                onSearch={onSearchSubtitles}
                onSelect={onSelectSubtitle}
                onShowLanguage={onShowSubtitleLanguage}
                onOffsetChange={onSubtitleOffsetChange}
                preferencesKey={subtitlePreferencesKey}
                defaultLanguage={subtitleDefaultLanguage}
                container={overlayContainer}
              />
              {audioMenu && (
                <AudioMenu
                  {...audioMenu}
                  navId={PLAYER_NAV.audio}
                  container={overlayContainer}
                  tracks={audioTracks}
                  selectedTrackIndex={selectedAudioTrackIndex}
                  onSelectTrack={onSelectAudioTrack}
                  onOpenChange={open => {
                    onMenuOpenChange(open);
                    audioMenu.onOpenChange?.(open);
                  }}
                />
              )}
              {/* The remote sets the TV's volume, and the TV app is always full screen */}
              {!builtForTizen && (
                <>
                  <IconButton
                    navId={PLAYER_NAV.fullscreen}
                    size="lg"
                    label={t('player.fullscreen')}
                    icon={<FullscreenIcon />}
                    onClick={() => {
                      const request = document.fullscreenElement
                        ? document.exitFullscreen()
                        : videoRef.current?.parentElement?.requestFullscreen();
                      void request?.catch(() => setNotice(t('player.fullscreenUnavailable')));
                    }}
                  />
                  <IconButton
                    navId={PLAYER_NAV.mute}
                    size="lg"
                    label={muted ? t('player.unmute') : t('player.mute')}
                    icon={muted ? <MutedIcon /> : <VolumeIcon />}
                    onClick={() => {
                      if (videoRef.current) videoRef.current.muted = !muted;
                    }}
                  />
                  {/* Last in the row: while focused, a slider owns Left and Right */}
                  <div className={styles.volume}>
                    {/* Named without a header, so it fits the row */}
                    <span id="player-volume-label" className={visuallyHidden}>
                      {t('player.volume')}
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
