import type { MediaDto } from '@miauflix/backend';
import { act, renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: () => dispatch }));
vi.mock('@features/realtime/realtime.middleware', () => ({
  realtimeRuntimeActions: {
    publishFocusRequested: (payload: unknown) => ({ type: 'focus', payload }),
    publishMapRequested: (payload: unknown) => ({ type: 'map', payload }),
  },
}));

import type { CategoryRowHandle } from '../components/CategoryRow';
import { useRealtimeInterest } from './useRealtimeInterest';

const card = (mediaId: number) => ({ _type: 'movie', mediaId }) as MediaDto;

const rowWith = (window: { media: MediaDto[]; center: number; visible: number[] }) =>
  ({ getInterestWindow: () => window }) as unknown as CategoryRowHandle;

const published = (type: 'focus' | 'map') =>
  dispatch.mock.calls.map(([action]) => action).filter(action => action.type === type);

describe('useRealtimeInterest', () => {
  beforeEach(() => {
    dispatch.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = () => {
    const window = { media: [card(1), card(2)], center: 0, visible: [0] };
    const rowRefs: MutableRefObject<Map<number, CategoryRowHandle>> = {
      current: new Map([[0, rowWith(window)]]),
    };
    const props = {
      rowRefs,
      rowCount: 1,
      activeCategory: 0,
      selectedMedia: card(1) as MediaDto | null,
      subtitleLanguage: 'en',
      view: 'browse' as const,
      sessionId: 's1' as string | null,
    };
    const hook = renderHook(p => useRealtimeInterest(p), { initialProps: props });
    return { ...hook, props, window };
  };

  it('publishes on mount and again only when the interest changes', () => {
    const { rerender, props } = setup();
    expect(published('focus')).toHaveLength(1);
    expect(published('map')).toHaveLength(1);

    rerender({ ...props, rowRefs: props.rowRefs });
    rerender({ ...props, subtitleLanguage: 'en' });
    expect(published('focus')).toHaveLength(1);

    rerender({ ...props, selectedMedia: card(2) });
    expect(published('focus')).toHaveLength(2);
    expect(published('focus')[1]?.payload).toMatchObject({
      navigationRevision: 2,
      media: { kind: 'movie', mediaId: 2 },
    });
  });

  it('publishes the same interest again for a new session', () => {
    const { rerender, props } = setup();
    rerender({ ...props, sessionId: 's2' });
    expect(published('focus')).toHaveLength(2);
    expect(published('map')).toHaveLength(2);
  });

  it('publishes scrolling once it settles, and only if what is in view changed', () => {
    const { result, window } = setup();

    window.visible = [0, 1];
    act(() => {
      for (let frame = 0; frame < 10; frame += 1) result.current();
    });
    expect(published('map')).toHaveLength(1);

    act(() => vi.advanceTimersByTime(150));
    expect(published('map')).toHaveLength(2);
    expect(published('map')[1]?.payload).toMatchObject({
      visible: [
        [0, 0],
        [0, 1],
      ],
    });

    act(() => {
      result.current();
      vi.advanceTimersByTime(150);
    });
    expect(published('map')).toHaveLength(2);
  });
});
