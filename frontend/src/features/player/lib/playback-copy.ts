import { t } from '@shared/i18n';
export type PlaybackStatus =
  | 'checking'
  | 'preparing'
  | 'ready'
  | 'unavailable'
  | 'exhausted'
  | 'error';

interface PlaybackFailure {
  status?: number;
  data?: unknown;
}

function getFailureDetails(reason: unknown): PlaybackFailure {
  if (typeof reason !== 'object' || reason === null) return {};
  return reason as PlaybackFailure;
}

export function isUnavailablePlaybackFailure(reason: unknown): boolean {
  return getFailureDetails(reason).status === 404;
}

/** Shown while the player works through the candidates. */
export function getSourceAttemptMessage(
  attempt: { position: number; total: number },
  title: string
): string {
  return t('player.trying', { position: attempt.position, total: attempt.total, title });
}

/** Shown while a playing session's converted stream restarts, after a seek or a track switch. */
export function getStreamStageMessage(stage: 'downloading' | 'converting', title: string): string {
  return stage === 'downloading'
    ? t('player.downloadingPart', { title })
    : t('player.converting', { title });
}

/** Every source was tried (or none exists): offer to notify once one is out. */
export function getNoSourceMessage(title: string): string {
  return t('player.noSource', { title });
}

/** Sources exist, but none fits in storage, even after freeing what can be freed. */
export function isNoRoomPlaybackFailure(reason: unknown): boolean {
  return getFailureDetails(reason).status === 507;
}

export function getNoRoomMessage(kind: 'episode' | 'movie'): string {
  return t(kind === 'episode' ? 'player.noRoomEpisode' : 'player.noRoomMovie');
}

export function describePlaybackFailure(
  reason: unknown,
  title: string,
  kind: 'episode' | 'movie' = 'movie'
): string {
  const { status, data } = getFailureDetails(reason);
  if (isNoRoomPlaybackFailure(reason)) return getNoRoomMessage(kind);

  if (isUnavailablePlaybackFailure(reason)) {
    return t('player.failure.unavailable', { title });
  }
  if (status === 401 || status === 403) {
    return t('player.failure.session', { title });
  }
  if (status === 429) {
    return t('player.failure.rateLimited', { title });
  }
  if (status === 422 && typeof data === 'string' && data.trim()) {
    return t('player.failure.detail', { title, detail: data });
  }
  if (status === 0) {
    return t('player.failure.offline', { title });
  }
  if (status !== undefined && status >= 500) {
    return t('player.failure.server', { title });
  }
  return t('player.failure.generic', { title });
}

export function getPlaybackStatusMessage(status: PlaybackStatus, title: string): string {
  switch (status) {
    case 'checking':
      return t('player.status.checking', { title });
    case 'preparing':
      return t('player.status.preparing', { title });
    case 'ready':
      return t('player.status.ready', { title });
    case 'unavailable':
      return t('player.status.unavailable', { title });
    case 'exhausted':
      return getNoSourceMessage(title);
    case 'error':
      return t('player.status.error', { title });
  }
}
