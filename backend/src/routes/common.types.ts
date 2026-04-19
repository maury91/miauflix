import type { AuthService } from '@services/auth/auth.service';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import type { ContentCatalogService } from '@services/content-catalog/content-catalog.service';
import type { TraktService } from '@services/content-catalog/trakt/trakt.service';
import type { DownloadService } from '@services/download/download.service';
import type { ListService } from '@services/media/list.service';
import type { MediaService } from '@services/media/media.service';
import type { RequestService } from '@services/request/request.service';
import type { Scheduler } from '@services/scheduler';
import type { AuditLogService } from '@services/security/audit-log.service';
import type { VpnDetectionService } from '@services/security/vpn.service';
import type {
  ContentDirectoryService,
  SourceMetadataFileService,
  SourceService,
} from '@services/source';
import type { StatsService } from '@services/stats/stats.service';
import type { StreamService } from '@services/stream/stream.service';

export interface Deps {
  auditLogService: AuditLogService;
  authService: AuthService;
  catalogService: ContentCatalogService;
  configurationService: ConfigurationService;
  contentDirectoryService: ContentDirectoryService;
  downloadService: DownloadService;
  listService: ListService;
  magnetService: SourceMetadataFileService;
  mediaService: MediaService;
  requestService: RequestService;
  scheduler: Scheduler;
  sourceService: SourceService;
  statsService: StatsService;
  streamService: StreamService;
  traktService: TraktService;
  vpnDetectionService: VpnDetectionService;
}

export interface ErrorResponse {
  error: string;
}
