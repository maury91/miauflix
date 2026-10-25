import { builtForTizen } from '@shared/config/constants';
import { useSyncExternalStore } from 'react';

export type AppRoute =
  | { type: 'home' }
  | { type: 'search' }
  | { type: 'movieDetails'; mediaId: number }
  | { type: 'showDetails'; mediaId: number }
  | { type: 'moviePlayer'; mediaId: number }
  | { type: 'episodePlayer'; showMediaId: number; seasonNumber: number; episodeNumber: number }
  | { type: 'settings' }
  | { type: 'configuration' }
  | { type: 'storage' }
  | { type: 'qrApproval'; approvalToken: string }
  | { type: 'notFound'; pathname: string };

const HOME: AppRoute = Object.freeze({ type: 'home' });
const HISTORY_KEY = '__miauflixRoute';

function positiveId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function parseRoute(pathname: string): AppRoute {
  const path = pathname.split('?')[0]?.replace(/\/+$/, '') || '/';
  if (path === '/') return HOME;
  if (path === '/search') return { type: 'search' };
  if (path === '/settings') return { type: 'settings' };
  if (path === '/settings/configuration') return { type: 'configuration' };
  if (path === '/settings/storage') return { type: 'storage' };
  const qr = path.match(/^\/auth\/qr\/([^/]+)$/);
  if (qr?.[1]) {
    try {
      const approvalToken = decodeURIComponent(qr[1]);
      if (approvalToken && !approvalToken.includes('/'))
        return { type: 'qrApproval', approvalToken };
    } catch {
      // Treat malformed escaped paths as unknown.
    }
  }
  const moviePlayer = path.match(/^\/movies\/([^/]+)\/watch$/);
  if (moviePlayer) {
    const mediaId = positiveId(moviePlayer[1]);
    if (mediaId) return { type: 'moviePlayer', mediaId };
  }
  const episode = path.match(/^\/shows\/([^/]+)\/seasons\/(\d+)\/episodes\/(\d+)\/watch$/);
  if (episode) {
    const showMediaId = positiveId(episode[1]);
    const seasonNumber = Number(episode[2]);
    const episodeNumber = positiveId(episode[3]);
    if (showMediaId && Number.isSafeInteger(seasonNumber) && episodeNumber) {
      return { type: 'episodePlayer', showMediaId, seasonNumber, episodeNumber };
    }
  }
  const detail = path.match(/^\/(movies|shows)\/([^/]+)$/);
  if (detail) {
    const mediaId = positiveId(detail[2]);
    if (mediaId)
      return detail[1] === 'movies'
        ? { type: 'movieDetails', mediaId }
        : { type: 'showDetails', mediaId };
  }
  return { type: 'notFound', pathname: path };
}

export function routePath(route: AppRoute): string {
  switch (route.type) {
    case 'home':
      return '/';
    case 'search':
      return '/search';
    case 'movieDetails':
      return `/movies/${route.mediaId}`;
    case 'showDetails':
      return `/shows/${route.mediaId}`;
    case 'moviePlayer':
      return `/movies/${route.mediaId}/watch`;
    case 'episodePlayer':
      return `/shows/${route.showMediaId}/seasons/${route.seasonNumber}/episodes/${route.episodeNumber}/watch`;
    case 'settings':
      return '/settings';
    case 'configuration':
      return '/settings/configuration';
    case 'storage':
      return '/settings/storage';
    case 'qrApproval':
      return `/auth/qr/${encodeURIComponent(route.approvalToken)}`;
    case 'notFound':
      return route.pathname;
  }
}

function routeKey(route: AppRoute): string {
  return routePath(route);
}

function browserPath(): string {
  if (typeof window === 'undefined') return '/';
  return builtForTizen
    ? window.location.hash.replace(/^#/, '') || '/'
    : `${window.location.pathname}${window.location.search}`;
}

let snapshot: AppRoute = typeof window === 'undefined' ? HOME : parseRoute(browserPath());
const subscribers = new Set<() => void>();
let listening = false;
let lastBrowserPath = browserPath();

function refreshFromBrowser(): void {
  const path = browserPath();
  if (path === lastBrowserPath) return;
  lastBrowserPath = path;
  snapshot = parseRoute(path);
  subscribers.forEach(listener => listener());
}

function startListening(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', refreshFromBrowser);
  if (builtForTizen) window.addEventListener('hashchange', refreshFromBrowser);
}

export function subscribeRoute(listener: () => void): () => void {
  subscribers.add(listener);
  startListening();
  refreshFromBrowser();
  return () => subscribers.delete(listener);
}

export function getRouteSnapshot(): AppRoute {
  return snapshot;
}

export function getServerRouteSnapshot(): AppRoute {
  return HOME;
}

export function useRoute(): AppRoute {
  return useSyncExternalStore(subscribeRoute, getRouteSnapshot, getServerRouteSnapshot);
}

export function navigate(
  route: AppRoute,
  options: { replace?: boolean; parent?: AppRoute } = {}
): void {
  if (typeof window === 'undefined') return;
  const path = routePath(route);
  const previous = snapshot;
  const url = builtForTizen ? `#${path}` : path;
  const previousState = window.history.state?.[HISTORY_KEY] ?? {};
  if (
    previous.type === 'settings' &&
    (route.type === 'storage' || route.type === 'configuration')
  ) {
    window.history.replaceState(
      { ...window.history.state, [HISTORY_KEY]: { ...previousState, focus: route.type } },
      '',
      window.location.href
    );
  }
  const state = {
    [HISTORY_KEY]: { parent: options.parent ? routeKey(options.parent) : routeKey(previous) },
  };
  if (options.replace) window.history.replaceState(state, '', url);
  else window.history.pushState(state, '', url);
  const browserLocation = browserPath();
  if (browserLocation !== lastBrowserPath || routeKey(snapshot) !== routeKey(route)) {
    lastBrowserPath = browserLocation;
    snapshot = route;
    subscribers.forEach(listener => listener());
  }
}

export function getRouteFocusSnapshot(): 'configuration' | 'storage' {
  const focus =
    typeof window === 'undefined' ? undefined : window.history.state?.[HISTORY_KEY]?.focus;
  return focus === 'storage' ? 'storage' : 'configuration';
}

export function useRouteFocus(): 'configuration' | 'storage' {
  return useSyncExternalStore(subscribeRoute, getRouteFocusSnapshot, () => 'configuration');
}

/** The route this history entry was opened from, when the app recorded one. */
export function getRouteParent(): AppRoute | null {
  if (typeof window === 'undefined') return null;
  const parent = (window.history.state?.[HISTORY_KEY] as { parent?: unknown } | undefined)?.parent;
  return typeof parent === 'string' ? parseRoute(parent) : null;
}

export function navigateBack(expectedParent: AppRoute, fallbackParent = expectedParent): void {
  if (typeof window === 'undefined') return;
  const historyRoute = window.history.state?.[HISTORY_KEY] as { parent?: string } | undefined;
  if (window.history.length > 1 && historyRoute?.parent === routeKey(expectedParent)) {
    window.history.back();
    return;
  }
  navigate(fallbackParent, { replace: true });
}
