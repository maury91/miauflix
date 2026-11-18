import { RealtimeClient } from '@features/realtime/realtime.client';
import type { MediaDto } from '@miauflix/backend';
import { cardImageVersion } from '@miauflix/service-contracts/card-image/v1';
import { configureStore } from '@reduxjs/toolkit';
import { visuallyHidden } from '@shared/design-system/a11y.css';
import { label as visibleLabel } from '@shared/design-system/collection-tile/collectionTile.css';
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

/** The `rev` a card image URL carries for an artwork revision (the layout version follows it). */
const rev = (revision: number) => cardImageVersion(revision).replace('.', '\\.');
const revised = (revision: number) =>
  expect.stringMatching(new RegExp(`\\?rev=${rev(revision)}$`, 'u'));

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
    const sources = () => [...view.container.querySelectorAll('img')].map(image => image.src);
    // One card image, versioned by the newer artwork's revision
    expect(sources()).toEqual([
      expect.stringMatching(
        new RegExp(`/api/artwork/card/movie/1/sm\\.webp\\?rev=${rev(2)}$`, 'u')
      ),
    ]);
    view.rerender(
      <Provider store={store}>
        <MediaCard {...props} media={{ ...props.media, artworkRevision: 3 }} />
      </Provider>
    );
    expect(sources()).toEqual([revised(3)]);
    // A card image that fails falls back to the backdrop and logo layers of the same revision
    act(() => {
      view.container.querySelector('img')!.dispatchEvent(new Event('error'));
    });
    expect(sources()).toEqual([props.media.backdrop, props.media.logo]);
  });

  it('keeps the title visible until the card image shows, and the old image while a newer loads', () => {
    const store = configureStore({ reducer: { artwork: artworkSlice.reducer } });
    const props = {
      media: {
        ...media,
        backdrop: 'https://image.test/b.jpg',
        logo: 'https://image.test/l.png',
        artworkRevision: 1,
      },
      width: 320,
      onSelect: vi.fn(),
    };
    const view = render(
      <Provider store={store}>
        <MediaCard {...props} />
      </Provider>
    );
    const card = screen.getByRole('button');
    const label = () => document.getElementById(card.getAttribute('aria-labelledby')!)!;
    const sources = () => [...view.container.querySelectorAll('img')].map(image => image.src);
    expect(label()).toHaveClass(visibleLabel);
    act(() => {
      view.container.querySelector('img')!.dispatchEvent(new Event('load'));
    });
    // The card image has the title drawn in: the overlay title steps aside only now
    expect(label()).toHaveClass(visuallyHidden);
    view.rerender(
      <Provider store={store}>
        <MediaCard {...props} media={{ ...props.media, artworkRevision: 2 }} />
      </Provider>
    );
    // The revision-1 image stays in view under the revision-2 one until it loads
    expect(sources()).toEqual([revised(1), revised(2)]);
    expect(label()).toHaveClass(visuallyHidden);
    act(() => {
      view.container.querySelectorAll('img')[1]!.dispatchEvent(new Event('load'));
    });
    expect(sources()).toEqual([revised(2)]);
    expect(label()).toHaveClass(visuallyHidden);

    // Revision 3 fails: the plain backdrop and logo layers show, and the label stays hidden by the
    // logo; once the logo fails too, only the plain backdrop shows, with the label over it
    view.rerender(
      <Provider store={store}>
        <MediaCard {...props} media={{ ...props.media, artworkRevision: 3 }} />
      </Provider>
    );
    act(() => {
      view.container.querySelectorAll('img')[1]!.dispatchEvent(new Event('error'));
    });
    expect(sources()).toEqual([props.media.backdrop, props.media.logo]);
    act(() => {
      view.container.querySelectorAll('img')[1]!.dispatchEvent(new Event('error'));
      view.container.querySelector('img')!.dispatchEvent(new Event('load'));
    });
    expect(sources()).toEqual([props.media.backdrop]);
    expect(label()).toHaveClass(visibleLabel);
    // Revision 4 loads over the plain backdrop: the label stays until the titled image shows
    view.rerender(
      <Provider store={store}>
        <MediaCard {...props} media={{ ...props.media, artworkRevision: 4 }} />
      </Provider>
    );
    expect(sources().at(-1)).toEqual(revised(4));
    expect(label()).toHaveClass(visibleLabel);
    act(() => {
      view.container
        .querySelectorAll('img')
        [view.container.querySelectorAll('img').length - 1]!.dispatchEvent(new Event('load'));
    });
    expect(label()).toHaveClass(visuallyHidden);
  });

  it('holds nothing from another title when a reused slot shows a different one', () => {
    const store = configureStore({ reducer: { artwork: artworkSlice.reducer } });
    const props = {
      media: { ...media, backdrop: 'https://image.test/b.jpg', artworkRevision: 1 },
      width: 320,
      onSelect: vi.fn(),
    };
    const view = render(
      <Provider store={store}>
        <MediaCard {...props} />
      </Provider>
    );
    const card = screen.getByRole('button');
    const label = () => document.getElementById(card.getAttribute('aria-labelledby')!)!;
    act(() => {
      view.container.querySelector('img')!.dispatchEvent(new Event('load'));
    });
    expect(label()).toHaveClass(visuallyHidden);
    view.rerender(
      <Provider store={store}>
        <MediaCard
          {...props}
          media={{ ...props.media, mediaId: 2, title: 'Another title', artworkRevision: 1 }}
        />
      </Provider>
    );
    // Only the new title's image, loading, with its name shown meanwhile
    expect(view.container.querySelectorAll('img')).toHaveLength(1);
    expect(label()).toHaveClass(visibleLabel);
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
        'https://image.tmdb.org/t/p/w300/card-logo.png'
      );
      expect(screen.getByRole('img', { name: 'Orbital' })).toHaveAttribute(
        'src',
        'https://image.tmdb.org/t/p/w500/hero-logo.png'
      );
      expect(card).toHaveFocus();
    } finally {
      client.stop();
    }
  });
});
