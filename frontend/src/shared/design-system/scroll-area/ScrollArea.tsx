import { IS_TV } from '@shared/config/constants';
import { createSmoothScroller, type SmoothScroller } from '@shared/lib/smooth-scroll';
import { useOptionalPointerLock } from '@shared/navigation/hooks';
import { type MouseEvent, type ReactNode, useEffect, useRef } from 'react';

import { type Space, space } from '../tokens';
import { revealOffset } from './revealOffset';
import * as styles from './scrollArea.css';

/** About as long as a reveal's motion (the scroller settles in ~300 ms), plus a frame or two. */
const POINTER_LOCK_MS = 350;

export interface ScrollAreaProps {
  children: ReactNode;
  /** Names the area as a region, when it is a landmark of its own (a pane, a page's body). */
  label?: string;
  /**
   * Heights covered by sticky chrome over the area's top or bottom edge (`4rem`, `56px`): a
   * revealed element stays clear of it.
   */
  stickyStart?: string;
  stickyEnd?: string;
  /** Room kept between a revealed element and the visible edges. Defaults to `lg`. */
  revealMargin?: Space;
  /**
   * `scroll` scrolls natively (wheel, touch, scrollbar) and animates reveals: the web default.
   * `transform` moves the content by a compositor transition instead: the TV default.
   */
  mode?: 'scroll' | 'transform';
  /** The viewport scrolled natively (`scroll` mode: wheel, touch, scrollbar or a reveal). */
  onScroll?: (viewport: HTMLDivElement) => void;
}

/** A CSS length in px: `rem` against the root font size, otherwise a number of px. */
function lengthInPx(length: string | undefined, rootPx: number): number {
  if (!length) return 0;
  const value = parseFloat(length);
  if (!Number.isFinite(value)) return 0;
  return length.trim().endsWith('rem') ? value * rootPx : value;
}

/** An element's top within `ancestor`, through the offset parents (transforms don't count). */
function offsetWithin(element: HTMLElement, ancestor: HTMLElement): number | null {
  let top = 0;
  let node: HTMLElement = element;
  while (node !== ancestor) {
    top += node.offsetTop;
    const parent: Element | null = node.offsetParent;
    if (parent === ancestor) return top;
    if (!(parent instanceof HTMLElement) || !ancestor.contains(parent)) return null;
    node = parent;
  }
  return null;
}

/**
 * Owns a region's vertical scrolling and reveals the focused element in it. It watches
 * `data-focused` inside its content: when a key moves virtual focus onto an element out of view,
 * it scrolls just enough to show it whole (clear of sticky chrome, with `revealMargin` around it)
 * and locks the pointer until the motion ends, so the content sliding under a resting pointer
 * never takes focus. Pointer focus never scrolls; the wheel, touch and the scrollbar do (web).
 * It holds no focus state of its own; horizontal rows are Carousels.
 */
export function ScrollArea({
  children,
  label,
  stickyStart,
  stickyEnd,
  revealMargin = 'lg',
  mode = IS_TV ? 'transform' : 'scroll',
  onScroll,
}: ScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<SmoothScroller | null>(null);
  const lastInput = useRef<'key' | 'pointer'>('key');
  const lockedUntil = useRef(0);
  // The navigation layer's pointer lock, when there is one: held for the reveal's motion too
  const layerLock = useOptionalPointerLock();
  const layerLockRef = useRef(layerLock);
  layerLockRef.current = layerLock;
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  /** The content position carried across a mode change. */
  const carried = useRef<number | null>(null);
  const latest = useRef({ stickyStart, stickyEnd, revealMargin });
  latest.current = { stickyStart, stickyEnd, revealMargin };

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const scroller = createSmoothScroller(mode === 'transform' ? content : viewport, 'y', {
      transform: mode === 'transform',
    });
    scrollerRef.current = scroller;
    // A mode change keeps one logical position (the outgoing mode cleared its own displacement)
    const restored = carried.current !== null;
    if (carried.current !== null) {
      scroller.scrollTo(carried.current, { instant: true });
      carried.current = null;
    }

    const reveal = (element: HTMLElement, instant: boolean) => {
      const itemTop = offsetWithin(element, content);
      if (itemTop === null) return;
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const { stickyStart, stickyEnd, revealMargin } = latest.current;
      const current = scroller.position();
      const target = revealOffset({
        current,
        viewport: viewport.clientHeight,
        content: content.offsetHeight,
        itemTop,
        itemHeight: element.offsetHeight,
        startInset: lengthInPx(stickyStart, rootPx),
        endInset: lengthInPx(stickyEnd, rootPx),
        margin: lengthInPx(space[revealMargin], rootPx),
      });
      if (Math.abs(target - current) < 0.5) return;
      if (!instant) {
        lockedUntil.current = Date.now() + POINTER_LOCK_MS;
        const release = layerLockRef.current?.();
        if (release) window.setTimeout(release, POINTER_LOCK_MS);
      }
      scroller.scrollTo(target, { instant });
    };

    // Restoring a focused element on mount shows it at once (not after a mode change: the
    // carried position is where the user left the content)
    const initial = restored ? null : content.querySelector('[data-focused]');
    if (initial instanceof HTMLElement) reveal(initial, true);

    // The focused element a record reports: one gaining the attribute, or one mounted already
    // focused (a replaced or virtualized item), itself or inside what was added
    const focusedIn = (record: MutationRecord): HTMLElement | null => {
      if (record.type === 'attributes') {
        const { target } = record;
        return target instanceof HTMLElement && target.hasAttribute('data-focused') ? target : null;
      }
      for (let index = record.addedNodes.length - 1; index >= 0; index--) {
        const node = record.addedNodes[index];
        if (!(node instanceof HTMLElement)) continue;
        if (node.hasAttribute('data-focused')) return node;
        const inside = node.querySelector('[data-focused]');
        if (inside instanceof HTMLElement) return inside;
      }
      return null;
    };
    const observer = new MutationObserver(records => {
      // Pointer focus never scrolls: the pointer is already on what it focused
      if (lastInput.current === 'pointer') return;
      for (let index = records.length - 1; index >= 0; index--) {
        const target = focusedIn(records[index]);
        if (target) {
          reveal(target, false);
          return;
        }
      }
    });
    observer.observe(content, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-focused'],
    });
    const onKeyDown = () => {
      lastInput.current = 'key';
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown, true);
      // Hand the position to the next mode, clearing this mode's displacement so it is not applied
      // twice (a mode change; on unmount nothing reads it)
      carried.current = scroller.position();
      scroller.dispose();
      if (mode === 'transform') {
        content.style.transition = '';
        content.style.transform = '';
      } else {
        viewport.scrollTop = 0;
      }
      scrollerRef.current = null;
    };
  }, [mode]);

  // Ahead of the items' own handlers: while a reveal moves the content, or when the content
  // stopped under a pointer that has not moved, the pointer focuses nothing
  const onMouseMoveCapture = (event: MouseEvent) => {
    const previous = lastPointer.current;
    lastPointer.current = { x: event.clientX, y: event.clientY };
    const resting =
      previous !== null && previous.x === event.clientX && previous.y === event.clientY;
    if (Date.now() < lockedUntil.current || resting) {
      event.stopPropagation();
      return;
    }
    lastInput.current = 'pointer';
  };

  return (
    <div
      ref={viewportRef}
      className={styles.viewport}
      data-mode={mode}
      role={label ? 'region' : undefined}
      aria-label={label}
      onMouseMoveCapture={onMouseMoveCapture}
      onScroll={onScroll ? event => onScroll(event.currentTarget) : undefined}
      onWheel={() => {
        // The wheel scrolls (web): the pointer is in charge until a key is pressed again
        lastInput.current = 'pointer';
      }}
    >
      <div ref={contentRef} className={styles.content}>
        {children}
      </div>
    </div>
  );
}
