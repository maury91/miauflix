import type { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';
import type { AuthService } from '@services/auth/auth.service';
import type { QrLoginService } from '@services/auth/qr-login.service';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import type { ListClientService } from '@services/list/list-client.service';
import type { ListService } from '@services/media/list.service';
import type { MediaService } from '@services/media/media.service';
import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';
import type { NotificationService } from '@services/notifications/notification.service';
import type { AudioPlaybackService } from '@services/playback/audio-playback.service';
import type { PlaybackSessionService } from '@services/playback/playback-session.service';
import type { StreamService } from '@services/playback/stream.service';
import type { PreloadIntentService } from '@services/preload/preload-intent.service';
import type { ProfileService } from '@services/profile/profile.service';
import type { ProgressService } from '@services/progress/progress.service';
import type { MediaRatingService } from '@services/ratings/media-rating.service';
import type { RequestService } from '@services/request/request.service';
import type { AuditLogService } from '@services/security/audit-log.service';
import type { SourceMetadataFileService, SourceService } from '@services/source';
import type { SourceAvailabilityService } from '@services/source/source-availability.service';
import type { SourcesClientService } from '@services/sources-client/sources-client.service';
import type { StatsService } from '@services/stats/stats.service';
import type { StorageInventoryService } from '@services/storage/storage-inventory.service';
import type { SubtitlesService } from '@services/subtitles/subtitles.service';
import type { TvPairingService } from '@services/tv-pairing/tv-pairing.service';

export interface Deps {
  /** Learns the addresses the server is reached at, for TV apps; absent in tests. */
  tvPairingService?: TvPairingService;
  mediaRatingService: MediaRatingService;
  storageInventoryService: StorageInventoryService;
  notificationService: NotificationService;
  auditLogService: AuditLogService;
  authService: AuthService;
  catalogClient: CatalogClientService;
  configurationService: ConfigurationService;
  sourcesClientService: SourcesClientService;
  listService: ListService;
  listClient: ListClientService;
  magnetService: SourceMetadataFileService;
  mediaService: MediaService;
  requestService: RequestService;
  sourceService: SourceService;
  sourceAvailabilityService: SourceAvailabilityService;
  statsService: StatsService;
  streamService: StreamService;
  qrLoginService: QrLoginService;
  preloadIntentService: PreloadIntentService;
  playbackSessionService: PlaybackSessionService;
  audioPlaybackService: AudioPlaybackService;
  profileService: ProfileService;
  progressService: ProgressService;
  subtitlesService: SubtitlesService;
  mediaLoadClient: MediaLoadClientService;
}

/** Rate limit middleware for a number of requests per window; one factory serves every route. */
export type RateLimitGuard = ReturnType<typeof createRateLimitMiddlewareFactory>;

/** What each route factory gets: the services, plus the middleware built once for all routes. */
export interface RouteDeps extends Deps {
  rateLimitGuard: RateLimitGuard;
}
