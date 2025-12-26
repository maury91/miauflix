import type { AuthService } from '@services/auth/auth.service';
import type { DownloadService } from '@services/download/download.service';
import type { ListService } from '@services/media/list.service';
import type { MediaService } from '@services/media/media.service';
import type { RequestService } from '@services/request/request.service';
import type { AuditLogService } from '@services/security/audit-log.service';
import type { VpnDetectionService } from '@services/security/vpn.service';
import type {
  ContentDirectoryService,
  SourceMetadataFileService,
  SourceService,
} from '@services/source';
import type { StreamService } from '@services/stream/stream.service';
import type { TMDBApi } from '@services/tmdb/tmdb.api';
import type { TraktService } from '@services/trakt/trakt.service';

export interface Deps {
  authService: AuthService;
  auditLogService: AuditLogService;
  mediaService: MediaService;
  sourceService: SourceService;
  listService: ListService;
  tmdbApi: TMDBApi;
  vpnDetectionService: VpnDetectionService;
  contentDirectoryService: ContentDirectoryService;
  magnetService: SourceMetadataFileService;
  traktService: TraktService;
  downloadService: DownloadService;
  streamService: StreamService;
  requestService: RequestService;
}

export interface ErrorResponse {
  error: string;
}
