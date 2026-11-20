import { memo, type MouseEvent, type ReactNode } from 'react';

import { IconButton } from '../icon-button/IconButton';
import { SurfaceContextProvider } from '../surface';
import type { CarouselProps } from './Carousel';
import * as styles from './carousel.css';
import { itemExtent } from './collectionGeometry';
import { useCarousel } from './useCarousel';

import ChevronLeftIcon from '~icons/mdi/chevron-left';
import ChevronRightIcon from '~icons/mdi/chevron-right';

/** Carousel as DOM: a translated track of positioned slots, edge fades and page buttons. */
export function CarouselDom(props: CarouselProps) {
  const { labelledBy, label, count, renderItem, geometry, pageButtons, surface = 'canvas' } = props;
  const carousel = useCarousel(props);
  const { composite, focusedIndex, leadingIndex, height, canGoBack, canGoForward } = carousel;
  const { itemWidth, gap, peek, contentWidth } = geometry;
  const slots: ReactNode[] = [];
  for (let index = carousel.first; index <= carousel.last; index++) {
    slots.push(
      <DomSlot
        key={index}
        index={index}
        count={count}
        x={itemExtent(index, geometry).start}
        width={itemWidth}
        height={height}
        focused={index === focusedIndex}
        renderItem={renderItem}
        onPointer={carousel.handlePointer}
      />
    );
  }
  return (
    <section
      ref={composite.ref}
      className={styles.root}
      aria-roledescription="carousel"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
    >
      <div className={styles.viewport} style={{ width: contentWidth + peek * 2, height }}>
        <ul
          className={styles.track}
          style={{ transform: `translateX(${-leadingIndex * (itemWidth + gap)}px)` }}
        >
          {slots}
        </ul>
        {canGoBack && peek > 0 && (
          <span
            className={styles.edge}
            data-side="start"
            data-surface={surface}
            style={{ width: peek }}
          />
        )}
        {canGoForward && peek > 0 && (
          <span
            className={styles.edge}
            data-side="end"
            data-surface={surface}
            style={{ width: peek }}
          />
        )}
        {pageButtons && (
          <SurfaceContextProvider value="overMedia">
            {canGoBack && (
              <span className={styles.pageButton} data-side="start">
                <IconButton
                  label={pageButtons.previousLabel}
                  icon={<ChevronLeftIcon />}
                  size="sm"
                  tabIndex={-1}
                  onClick={() => pageButtons.onPage(-1)}
                />
              </span>
            )}
            {canGoForward && (
              <span className={styles.pageButton} data-side="end">
                <IconButton
                  label={pageButtons.nextLabel}
                  icon={<ChevronRightIcon />}
                  size="sm"
                  tabIndex={-1}
                  onClick={() => pageButtons.onPage(1)}
                />
              </span>
            )}
          </SurfaceContextProvider>
        )}
      </div>
    </section>
  );
}

export interface CarouselSlotProps {
  index: number;
  count: number;
  x: number;
  width: number;
  height: number;
  focused: boolean;
  renderItem: CarouselProps['renderItem'];
  onPointer: (index: number, event: MouseEvent) => void;
}

/** One positioned item. Memoized: a focus move re-renders only the slots whose focus changed. */
const DomSlot = memo(function DomSlot({
  index,
  count,
  x,
  width,
  height,
  focused,
  renderItem,
  onPointer,
}: CarouselSlotProps) {
  return (
    <li
      className={styles.slot}
      aria-setsize={count}
      aria-posinset={index + 1}
      data-focused={focused || undefined}
      // The composite part: DOM focus mirrors onto the item inside it
      data-nav-part={index}
      style={{ width, height, transform: `translateX(${x}px)` }}
      onMouseMove={event => onPointer(index, event)}
    >
      {renderItem(index, { focused })}
    </li>
  );
});
