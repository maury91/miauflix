import { memo, type ReactNode, useLayoutEffect, useMemo, useRef } from 'react';

import {
  easeStandard,
  type GlNode,
  GlParentProvider,
  remPx,
  useGlNode,
  useGlPaint,
  useGlParent,
} from '../gl';
import { duration, space } from '../tokens';
import type { CarouselProps } from './Carousel';
import { paintCarouselEdges } from './carousel.art';
import * as styles from './carousel.css';
import type { CarouselSlotProps } from './CarouselDom';
import { type CollectionGeometry, itemExtent } from './collectionGeometry';
import { useCarousel } from './useCarousel';

/**
 * Carousel drawn by the GlSurface: the viewport clips, the track slides in the renderer and the
 * edges fade over the peeks (carousel.art.ts). The DOM keeps only the list and its items,
 * unpositioned, for focus and the reader.
 */
export function CarouselGl(props: CarouselProps) {
  const { labelledBy, label, count, renderItem, geometry, surface = 'canvas' } = props;
  const carousel = useCarousel(props, { pointerLock: 'settle' });
  const { composite, focusedIndex, leadingIndex, height, canGoBack, canGoForward } = carousel;
  const { itemWidth, peek, contentWidth } = geometry;
  const parent = useGlParent();
  const viewportNode = useGlNode();
  const trackNode = useGlNode(viewportNode);
  const edgesNode = useGlNode(viewportNode);
  const viewportPadding = remPx(space.xs);
  const viewportWidth = contentWidth + peek * 2;
  const viewportHeight = height + viewportPadding * 2;
  const trackPlaced = useRef(false);
  useLayoutEffect(() => {
    if (!parent || !viewportNode || !trackNode || !edgesNode) return;
    viewportNode.set({
      x: (parent.width - viewportWidth) / 2,
      width: viewportWidth,
      height: viewportHeight,
      clip: true,
    });
    trackNode.set({ y: viewportPadding });
    edgesNode.set({ z: 2 });
  });
  // The pointer stays locked until the track lands (useCarousel), even when its frames start late
  const { releasePointer } = carousel;
  useLayoutEffect(() => {
    if (!trackNode) return;
    trackNode.onSettle = property => {
      if (property === 'x') releasePointer();
    };
    return () => {
      trackNode.onSettle = null;
    };
  }, [releasePointer, trackNode]);
  useLayoutEffect(() => {
    if (!trackNode) return;
    const moving = placeTrack(trackNode, leadingIndex, geometry, trackPlaced.current);
    trackPlaced.current = true;
    if (!moving) releasePointer();
  }, [leadingIndex, geometry, releasePointer, trackNode]);
  useGlPaint(
    edgesNode,
    painter =>
      paintCarouselEdges(painter, {
        peek,
        width: viewportWidth,
        height: viewportHeight,
        surface,
        canGoBack,
        canGoForward,
      }),
    [peek, surface, canGoBack, canGoForward, viewportWidth, viewportHeight]
  );
  const slots: ReactNode[] = [];
  for (let index = carousel.first; index <= carousel.last; index++) {
    slots.push(
      <GlSlot
        key={index}
        index={index}
        count={count}
        x={itemExtent(index, geometry).start}
        width={itemWidth}
        height={height}
        focused={index === focusedIndex}
        renderItem={renderItem}
        onPointer={carousel.handlePointer}
        track={trackNode}
      />
    );
  }
  return (
    <section
      ref={composite.ref}
      className={styles.glRoot}
      aria-roledescription="carousel"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
    >
      <ul className={styles.glList}>{slots}</ul>
    </section>
  );
}

/** One item, a node on the track. Memoized: a focus move re-renders only the slots it changed. */
const GlSlot = memo(function GlSlot({
  index,
  count,
  x,
  width,
  height,
  focused,
  renderItem,
  onPointer,
  track,
}: CarouselSlotProps & { track: GlNode | null }) {
  const parent = useGlParent();
  const node = useGlNode(track);
  useLayoutEffect(() => {
    node?.set({ x, width, height, z: focused ? 1 : 0 });
  });
  const value = useMemo(
    () => (parent && node ? { renderer: parent.renderer, node, width, height, radius: 0 } : null),
    [parent, height, node, width]
  );
  return (
    <li
      className={styles.glSlot}
      aria-setsize={count}
      aria-posinset={index + 1}
      data-focused={focused || undefined}
      data-nav-part={index}
      onMouseMove={event => onPointer(index, event)}
    >
      {value && <GlParentProvider value={value}>{renderItem(index, { focused })}</GlParentProvider>}
    </li>
  );
});

/**
 * Moves the track so `leadingIndex` is the left-most whole item (at once the first time). The
 * track's X is the only thing that moves when the carousel pages. True while it slides.
 */
function placeTrack(
  track: GlNode,
  leadingIndex: number,
  { itemWidth, gap }: CollectionGeometry,
  animate: boolean
) {
  const x = -leadingIndex * (itemWidth + gap);
  if (animate) track.animate('x', x, parseFloat(duration.fast), easeStandard);
  else track.set({ x });
  /** Whether it's sliding (it lands with the track's onSettle). */
  return 'x' in track.animations;
}
