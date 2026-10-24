import type { MediaDto } from '@miauflix/backend';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: () => dispatch }));
vi.mock('@features/realtime/realtime.middleware', () => ({
  realtimeRuntimeActions: {
    artworkSubscriptionsChanged: (refs: unknown) => ({ type: 'subscriptions', payload: refs }),
  },
}));

import { useHomeArtwork } from './useHomeArtwork';

const card = (mediaId: number, type: 'movie' | 'tvshow' = 'movie') =>
  ({ _type: type, mediaId, backdrop: `/b${mediaId}.jpg`, logo: '' }) as MediaDto;
const key = (ref: { mediaType: string; mediaId: number }) => `${ref.mediaType}:${ref.mediaId}`;

/** The refs Home is subscribed to after the last subscription change. */
const subscribed = () => {
  const last = dispatch.mock.calls
    .map(([action]) => action)
    .findLast(a => a.type === 'subscriptions');
  return (last?.payload ?? []).map(key).sort();
};
const removedKeys = () =>
  dispatch.mock.calls
    .map(([action]) => action)
    .filter(a => a.type === 'artwork/removed')
    .flatMap(a => a.payload.map(key));

describe('useHomeArtwork', () => {
  beforeEach(() => dispatch.mockClear());

  const props = {
    rowSlugs: ['trending', 'popular'],
    continueMedia: [card(1)],
    selectedMedia: card(2, 'tvshow') as MediaDto | null,
    sessionId: 's1' as string | null,
  };

  it('subscribes the hero, Continue watching and every loaded row', () => {
    const { result } = renderHook(p => useHomeArtwork(p), { initialProps: props });
    expect(subscribed()).toEqual(['movie:1', 'tv:2']);
    act(() => result.current.onMediaLoaded('trending', [card(3), card(4)]));
    act(() => result.current.onMediaLoaded('popular', [card(4), card(5, 'tvshow')]));
    expect(subscribed()).toEqual(['movie:1', 'movie:3', 'movie:4', 'tv:2', 'tv:5']);
  });

  it('drops a row that left the feed, and unsubscribes only titles no longer shown', () => {
    const { result, rerender } = renderHook(p => useHomeArtwork(p), { initialProps: props });
    act(() => result.current.onMediaLoaded('trending', [card(3), card(4)]));
    act(() => result.current.onMediaLoaded('popular', [card(4)]));
    rerender({ ...props, rowSlugs: ['popular'] });
    expect(subscribed()).toEqual(['movie:1', 'movie:4', 'tv:2']);
    expect(removedKeys()).toEqual(['movie:3']);
  });

  it('forgets loaded rows when the session changes, and everything on unmount', () => {
    const { result, rerender, unmount } = renderHook(p => useHomeArtwork(p), {
      initialProps: props,
    });
    act(() => result.current.onMediaLoaded('trending', [card(3)]));
    rerender({ ...props, sessionId: 's2' });
    expect(subscribed()).toEqual(['movie:1', 'tv:2']);
    unmount();
    expect(subscribed()).toEqual([]);
  });

  it('does not resubscribe when a row reports the same cards again', () => {
    const { result } = renderHook(p => useHomeArtwork(p), { initialProps: props });
    act(() => result.current.onMediaLoaded('trending', [card(3)]));
    const changes = dispatch.mock.calls.filter(([a]) => a.type === 'subscriptions').length;
    act(() => result.current.onMediaLoaded('trending', [card(3)]));
    expect(dispatch.mock.calls.filter(([a]) => a.type === 'subscriptions')).toHaveLength(changes);
  });
});
