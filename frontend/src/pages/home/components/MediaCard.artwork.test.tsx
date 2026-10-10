import { RealtimeClient } from '@features/realtime/realtime.client';
import type { MediaDto } from '@miauflix/backend';
import { configureStore } from '@reduxjs/toolkit';
import { artworkActions, artworkSlice } from '@store/slices/artwork';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MediaCard } from './MediaCard';
import { MediaHero } from './MediaHero';

vi.mock('@features/media/api/media.api', () => ({
  useEnsureBackdropFocusMutation: () => [() => ({ unwrap: async () => ({ backdropFocus: null }) })],
}));

class FakeResizeObserver {
  constructor(_callback: ResizeObserverCallback) {}

  observe(): void {}
  disconnect(): void {}
}

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(): void {}

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  message(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

const media = {
  _type: 'movie',
  id: 1,
  mediaId: 1,
  imdbId: null,
  title: 'Orbital',
  overview: '',
  poster: '',
  backdrop: '',
  logo: null,
  heroLogo: null,
  genres: [],
  popularity: 0,
  rating: 0,
  releaseDate: '',
  runtime: 0,
} as MediaDto;

afterEach(() => vi.unstubAllGlobals());

describe('live media artwork', () => {
  it('selects the backdrop and logo together and ignores older artwork', () => {
    const store = configureStore({ reducer: { artwork: artworkSlice.reducer } });
    const update = {
      mediaType: 'movie' as const,
      mediaId: 1,
      backdrop: 'https://image.test/new.jpg',
      logo: 'https://image.test/new.png',
      heroLogo: '',
      artworkRevision: 2,
      cardLogoStatus: 'ready' as const,
      heroLogoStatus: 'ready' as const,
    };
    store.dispatch(artworkActions.received(update));
    const props = {
      media: {
        ...media,
        backdrop: 'https://image.test/old.jpg',
        logo: 'https://image.test/old.png',
        artworkRevision: 1,
      },
      width: 320,
      selected: false,
      tabIndex: 0,
      onFocus: vi.fn(),
      onHover: vi.fn(),
      onSelect: vi.fn(),
    };
    const view = render(
      <Provider store={store}>
        <MediaCard {...props} />
      </Provider>
    );
    expect([...view.container.querySelectorAll('img')].map(image => image.src)).toEqual([
      update.backdrop,
      update.logo,
    ]);
    view.rerender(
      <Provider store={store}>
        <MediaCard {...props} media={{ ...props.media, artworkRevision: 3 }} />
      </Provider>
    );
    expect([...view.container.querySelectorAll('img')].map(image => image.src)).toEqual([
      props.media.backdrop,
      props.media.logo,
    ]);
  });

  it('loads the hero backdrop from the same revision as its logo', () => {
    const requested: string[] = [];
    class PendingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        requested.push(value);
      }
    }
    vi.stubGlobal('Image', PendingImage);
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const store = configureStore({ reducer: { artwork: artworkSlice.reducer } });
    store.dispatch(
      artworkActions.received({
        mediaType: 'movie',
        mediaId: 1,
        backdrop: 'https://image.test/new.jpg',
        logo: '',
        heroLogo: 'https://image.test/new.png',
        artworkRevision: 2,
        cardLogoStatus: 'ready',
        heroLogoStatus: 'ready',
      })
    );
    render(
      <Provider store={store}>
        <MediaHero
          media={{ ...media, backdrop: 'https://image.test/old.jpg', artworkRevision: 1 }}
        />
      </Provider>
    );
    expect([...new Set(requested)]).toEqual(['https://image.test/new.jpg']);
    expect(screen.getByRole('img', { name: 'Orbital' })).toHaveAttribute(
      'src',
      'https://image.test/new.png'
    );
  });

  it('updates card and hero logos in place without moving keyboard focus', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const store = configureStore({ reducer: { artwork: artworkSlice.reducer } });
    const client = new RealtimeClient('session-1', 'tab-1', vi.fn(), undefined, update =>
      store.dispatch(artworkActions.received(update))
    );
    client.start();

    try {
      const view = render(
        <Provider store={store}>
          <>
            <MediaCard
              media={media}
              width={320}
              selected
              tabIndex={0}
              onFocus={vi.fn()}
              onHover={vi.fn()}
              onSelect={vi.fn()}
            />
            <MediaHero media={media} />
          </>
        </Provider>
      );
      const card = screen.getByRole('button', { name: 'Orbital' });
      card.focus();
      expect(card).toHaveFocus();
      expect(view.container.querySelector('button img')).toBeNull();

      const socket = FakeWebSocket.instances[0]!;
      socket.open();
      socket.message({ type: 'ready', v: 1 });
      act(() =>
        socket.message({
          type: 'artwork-update',
          mediaType: 'movie',
          mediaId: 1,
          backdrop: '',
          logo: 'https://image.tmdb.org/t/p/original/card-logo.png',
          heroLogo: 'https://image.tmdb.org/t/p/original/hero-logo.png',
          artworkRevision: 1,
          cardLogoStatus: 'pending',
          heroLogoStatus: 'pending',
        })
      );

      expect(view.container.querySelector('button img')).toHaveAttribute(
        'src',
        'https://image.tmdb.org/t/p/original/card-logo.png'
      );
      expect(screen.getByRole('img', { name: 'Orbital' })).toHaveAttribute(
        'src',
        'https://image.tmdb.org/t/p/original/hero-logo.png'
      );
      expect(card).toHaveFocus();
    } finally {
      client.stop();
    }
  });
});
