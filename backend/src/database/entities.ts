import { AuditLog } from '@entities/audit-log.entity';
import { AvailabilityRequest } from '@entities/availability-request.entity';
import { BackgroundJob } from '@entities/background-job.entity';
import { ContentSource } from '@entities/content-source.entity';
import { Episode } from '@entities/episode.entity';
import { EpisodeSource } from '@entities/episode-source.entity';
import { MediaList, MediaListItem } from '@entities/list.entity';
import { MediaProbe } from '@entities/media-probe.entity';
import { MediaRating } from '@entities/media-rating.entity';
import { MigrationVersion } from '@entities/migration-version.entity';
import { Movie } from '@entities/movie.entity';
import { MovieSource } from '@entities/movie-source.entity';
import { Notification } from '@entities/notification.entity';
import { PlaybackGrant } from '@entities/playback-grant.entity';
import { Progress } from '@entities/progress.entity';
import { QrLoginRequest } from '@entities/qr-login-request.entity';
import { RecentSearch } from '@entities/recent-search.entity';
import { RefreshToken } from '@entities/refresh-token.entity';
import { Season } from '@entities/season.entity';
import { Storage } from '@entities/storage.entity';
import { StorageFile } from '@entities/storage-file.entity';
import { StorageFileClaim } from '@entities/storage-file-claim.entity';
import { TVShow } from '@entities/tvshow.entity';
import { User } from '@entities/user.entity';

/** Every entity in the backend database. Schema changes to them need a schema migration. */
export const ENTITIES = [
  Movie,
  ContentSource,
  MovieSource,
  Notification,
  AvailabilityRequest,
  TVShow,
  Season,
  Episode,
  EpisodeSource,
  MediaList,
  MediaListItem,
  MediaRating,
  User,
  RefreshToken,
  AuditLog,
  BackgroundJob,
  QrLoginRequest,
  Storage,
  StorageFile,
  StorageFileClaim,
  Progress,
  PlaybackGrant,
  MediaProbe,
  RecentSearch,
  MigrationVersion,
];
