import {
  forwardRef,
  type ReactNode,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import type { Easing } from '../core/easing';
import { GlNode } from '../core/scene';
import { GlParentScope } from './GlGroup';
import { useGlLayer, useGlParent } from './hooks';

export interface GlScrollerHandle {
  /** Animate the content's vertical offset to -`target` (like a scroll). */
  scrollTo: (target: number, options?: { instant?: boolean }) => void;
  /** Where the content is heading. */
  position: () => number;
}

export interface GlScrollerProps {
  z?: number;
  /** The content is clipped above this (px from the parent's top). */
  clipTop?: number;
  /** The content starts this far down (px from the parent's top), before scrolling. */
  contentTop?: number;
  /**
   * The content fades in over these px (from the parent's top), showing `fadeFrom` (a named layer
   * under it) through: the clip starts at fade[0].
   */
  fade?: [number, number];
  fadeFrom?: string;
  scrollDuration?: number;
  /** Without it, scrolls are instant. */
  scrollEasing?: Easing;
  /** The content came to rest after `scrollTo`. */
  onScrollRest?: () => void;
  children: ReactNode;
}

/**
 * A clipped viewport the size of its parent, its content scrolled vertically by `scrollTo`. The
 * first scroll is instant (placing the content where it starts).
 */
export const GlScroller = forwardRef<GlScrollerHandle, GlScrollerProps>(function GlScroller(
  {
    z = 0,
    clipTop = 0,
    contentTop = 0,
    fade,
    fadeFrom,
    scrollDuration = 300,
    scrollEasing,
    onScrollRest,
    children,
  },
  ref
) {
  const parent = useGlParent();
  const latestRest = useRef(onScrollRest);
  // Published on commit: a deferred rest must not see the callback of a discarded render
  useLayoutEffect(() => {
    latestRest.current = onScrollRest;
  });
  /** The pending deferred rest: replaced (cancelled) by the next scroll. */
  const restTask = useRef(0);
  const [viewport] = useState(() => {
    const node = new GlNode();
    node.clip = true;
    return node;
  });
  const [content] = useState(() => {
    const node = new GlNode();
    viewport.add(node);
    // In a frame callback: hand the rest to a task, so its work isn't in the frame
    node.onSettle = property => {
      if (property !== 'y') return;
      window.clearTimeout(restTask.current);
      restTask.current = window.setTimeout(() => latestRest.current?.());
    };
    return node;
  });
  const fadeSource = useGlLayer(fadeFrom);
  const scrolled = useRef(false);
  const scroll = useRef(0);
  const width = parent?.width ?? 0;
  const height = parent?.height ?? 0;
  // The content's offset inside the viewport
  const top = contentTop - clipTop;
  const parentNode = parent?.node;

  useLayoutEffect(() => () => window.clearTimeout(restTask.current), []);
  useLayoutEffect(() => {
    if (!parentNode) return;
    parentNode.add(viewport);
    return () => parentNode.remove(viewport);
  }, [parentNode, viewport]);
  useLayoutEffect(() => {
    viewport.set({ y: clipTop, z, width, height: height - clipTop });
    viewport.fade = fade ? [fade[0] - clipTop, fade[1] - clipTop] : null;
    viewport.fadeFrom = fade && fadeFrom ? fadeSource : null;
    content.set({ width, height: 0 });
    const running = content.animations.y;
    if (!running) content.set({ y: top - scroll.current });
    // The layout moved mid-scroll: head for where the target is now
    else if (running.to !== top - scroll.current)
      content.animate('y', top - scroll.current, running.duration, running.easing);
    viewport.invalidate();
  });

  useImperativeHandle(
    ref,
    () => ({
      scrollTo: (target, options) => {
        const next = Math.max(0, target);
        const instant = options?.instant || !scrolled.current;
        scrolled.current = true;
        scroll.current = next;
        // A rest still pending is from a scroll this one replaces
        window.clearTimeout(restTask.current);
        const settled = !content.animations.y && content.y === top - next;
        if (instant || !scrollEasing || settled) {
          // Already there (nothing will animate): at rest now
          content.set({ y: top - next });
          latestRest.current?.();
        } else content.animate('y', top - next, scrollDuration, scrollEasing);
      },
      position: () => scroll.current,
    }),
    [content, top, scrollDuration, scrollEasing]
  );

  return (
    <GlParentScope node={parent ? content : null} width={width} height={height}>
      {children}
    </GlParentScope>
  );
});
