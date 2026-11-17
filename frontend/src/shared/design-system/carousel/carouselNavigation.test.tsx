import { act, render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  type CarouselLayout,
  type CarouselNavigation,
  useCarouselNavigation,
  useCarouselPosition,
} from './carouselNavigation';

const layout: CarouselLayout = { count: 10, perPage: 4, paging: 'item' };

describe('useCarouselNavigation', () => {
  it('moves without re-rendering its owner, and keeps one object', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useCarouselNavigation(layout, 2);
    });
    const navigation = result.current;
    expect(navigation.position()).toEqual({ focused: 2, leading: 0 });

    act(() => {
      expect(navigation.move(1)).toBe(true);
    });
    expect(navigation.position()).toEqual({ focused: 3, leading: 3 });
    expect(renders).toBe(1);
    expect(result.current).toBe(navigation);
  });

  it('tells subscribers of every change, and only of changes', () => {
    const { result } = renderHook(() => useCarouselNavigation(layout));
    const navigation = result.current;
    const seen: number[] = [];
    const unsubscribe = navigation.subscribe(() => seen.push(navigation.position().focused));

    act(() => navigation.move(1));
    act(() => navigation.pointerFocus(3));
    act(() => navigation.pointerFocus(3));
    act(() => navigation.reveal(9));
    unsubscribe();
    act(() => navigation.move(-1));

    expect(seen).toEqual([1, 3, 9]);
    expect(navigation.position()).toEqual({ focused: 8, leading: 6 });
  });

  it('keeps a row still loading on the card it starts on, then bounds it to the cards', () => {
    const { result, rerender } = renderHook(
      ({ count }) => useCarouselNavigation({ ...layout, count }, 12),
      { initialProps: { count: 0 } }
    );
    expect(result.current.position()).toEqual({ focused: 12, leading: 12 });

    rerender({ count: 5 });
    expect(result.current.position()).toEqual({ focused: 4, leading: 1 });
  });

  it('tells readers that did not render when a new layout bounds the position', () => {
    let navigation: CarouselNavigation | undefined;
    const Owner = ({ count }: { count: number }) => {
      navigation = useCarouselNavigation({ ...layout, count }, 8);
      return <Reader navigation={navigation} />;
    };
    let readerRenders = 0;
    // Memoized and given only `navigation`: it renders again only through its subscription
    const Reader = ({ navigation: nav }: { navigation: CarouselNavigation }) => {
      readerRenders += 1;
      const focused = useCarouselPosition(nav, position => position.focused);
      return <output>{focused}</output>;
    };
    const view = render(<Owner count={10} />);
    expect(view.container.textContent).toBe('8');

    view.rerender(<Owner count={6} />);
    expect(navigation?.position()).toEqual({ focused: 5, leading: 2 });
    expect(view.container.textContent).toBe('5');
    expect(readerRenders).toBeGreaterThan(1);
  });
});

describe('useCarouselPosition', () => {
  it('re-renders only when what it selects changes', () => {
    const { result: owner } = renderHook(() => useCarouselNavigation(layout));
    const navigation = owner.current;
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useCarouselPosition(navigation, position => Math.floor(position.focused / 4));
    });
    expect(result.current).toBe(0);

    act(() => navigation.move(1));
    act(() => navigation.move(1));
    act(() => navigation.move(1));
    expect(renders).toBe(1);

    act(() => navigation.move(1));
    expect(result.current).toBe(1);
    expect(renders).toBe(2);
  });

  it('reads nothing without a navigation', () => {
    const { result } = renderHook(() =>
      useCarouselPosition(undefined, position => position.leading)
    );
    expect(result.current).toBeUndefined();
  });
});
