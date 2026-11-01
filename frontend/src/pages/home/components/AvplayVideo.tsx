import { AvplayMedia, type PlayerMedia } from '@features/player/lib/avplay-media';
import type { SubtitleCue } from '@features/player/lib/vtt';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import type { AVPlay } from '@/types/tizen';

/** AVPlay draws in this element's area, below the page. */
const VideoPlane = styled.object`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

/** Placed like the `<video>` element's captions: above the controls. */
const Caption = styled.div`
  position: absolute;
  bottom: 25%;
  left: 50%;
  z-index: 1;
  max-width: 80%;
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none;

  span {
    padding: 0.1em 0.35em;
    background: rgba(0, 0, 0, 0.8);
    color: #fff;
    font-size: 4.5vh;
    line-height: 1.35;
    white-space: pre-line;
    -webkit-box-decoration-break: clone;
  }
`;

export type PlayerMediaHandler = (event: { currentTarget: PlayerMedia }) => void;

const EVENT_HANDLERS = {
  loadedmetadata: 'onLoadedMetadata',
  seeked: 'onSeeked',
  timeupdate: 'onTimeUpdate',
  canplay: 'onCanPlay',
  playing: 'onPlaying',
  pause: 'onPause',
  ended: 'onEnded',
  error: 'onError',
} as const;

export type PlayerMediaEvents = Partial<
  Record<(typeof EVENT_HANDLERS)[keyof typeof EVENT_HANDLERS], PlayerMediaHandler>
>;

interface AvplayVideoProps extends PlayerMediaEvents {
  avplay: AVPlay;
  src: string;
  autoPlay: boolean;
  /** Receives the media while mounted, like a `<video>` ref. */
  mediaRef: (media: PlayerMedia | null) => void;
  'aria-label': string;
  subtitleCues: SubtitleCue[];
  subtitleOffset: number;
}

/**
 * Make the page transparent down to the video plane: clear the backgrounds of `layer` and its
 * ancestors, and hide everything beside them. Returns the undo.
 */
function revealVideoPlane(layer: HTMLElement): () => void {
  const undo: Array<() => void> = [];
  const setStyle = (element: HTMLElement, property: string, value: string): void => {
    const previous = element.style.getPropertyValue(property);
    const priority = element.style.getPropertyPriority(property);
    element.style.setProperty(property, value, 'important');
    undo.push(() => element.style.setProperty(property, previous, priority));
  };
  for (let node: HTMLElement | null = layer; node; node = node.parentElement) {
    setStyle(node, 'background', 'transparent');
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) continue;
    for (const sibling of Array.from<Element>(parent.children)) {
      if (sibling !== node && sibling instanceof HTMLElement)
        setStyle(sibling, 'visibility', 'hidden');
    }
  }
  // global.css paints the page background on body::before too
  const style = document.createElement('style');
  style.textContent = 'body::before { display: none !important; }';
  document.head.appendChild(style);
  undo.push(() => style.remove());
  return () => undo.reverse().forEach((restore: () => void) => restore());
}

function useMediaTime(media: AvplayMedia): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    const update = (): void => setTime(media.currentTime);
    media.addEventListener('timeupdate', update);
    media.addEventListener('seeked', update);
    return () => {
      media.removeEventListener('timeupdate', update);
      media.removeEventListener('seeked', update);
    };
  }, [media]);
  return time;
}

/** The Samsung TV's native player in place of `<video>`, with the same media events. */
export function AvplayVideo({
  avplay,
  src,
  autoPlay,
  mediaRef,
  'aria-label': label,
  subtitleCues,
  subtitleOffset,
  ...handlers
}: AvplayVideoProps) {
  const [media] = useState(() => new AvplayMedia(avplay));
  const planeRef = useRef<HTMLObjectElement>(null);
  const handlersRef = useRef<PlayerMediaEvents>(handlers);
  handlersRef.current = handlers;
  const now = useMediaTime(media);

  useLayoutEffect(() => {
    mediaRef(media);
    return () => mediaRef(null);
  }, [media, mediaRef]);

  useEffect(() => {
    const listeners = Object.entries(EVENT_HANDLERS).map(
      ([type, handler]: [string, keyof PlayerMediaEvents]) => {
        const listener = (): void => handlersRef.current[handler]?.({ currentTarget: media });
        media.addEventListener(type, listener);
        return () => media.removeEventListener(type, listener);
      }
    );
    return () => listeners.forEach((remove: () => void) => remove());
  }, [media]);

  useEffect(() => {
    const plane = planeRef.current;
    if (!plane) return;
    media.autoplay = autoPlay;
    media.open(src, plane);
    return () => media.close();
  }, [media, src, autoPlay]);

  useEffect(() => {
    const layer = planeRef.current?.parentElement;
    return layer ? revealVideoPlane(layer) : undefined;
  }, []);

  useEffect(() => {
    // The TV keeps the decoder for the app in front
    const onVisibility = (): void => (document.hidden ? media.suspend() : media.restore());
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [media]);

  const caption = subtitleCues.find(
    (cue: SubtitleCue) => now >= cue.start + subtitleOffset && now < cue.end + subtitleOffset
  );

  return (
    <>
      <VideoPlane ref={planeRef} type="application/avplayer" aria-label={label} />
      {caption && (
        <Caption aria-live="off" data-testid="avplay-caption">
          <span>{caption.text}</span>
        </Caption>
      )}
    </>
  );
}
