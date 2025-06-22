import { logger } from '@logger';
import path from 'path';
import type { EntityTarget, LogLevel, LogMessage, ObjectLiteral, Repository } from 'typeorm';
import { AbstractLogger, DataSource } from 'typeorm';

import { ENV } from '@constants';
import { AuditLog } from '@entities/audit-log.entity';
import { Episode } from '@entities/episode.entity';
import { Genre, GenreTranslation } from '@entities/genre.entity';
import { MediaList } from '@entities/list.entity';
import { Movie, MovieTranslation } from '@entities/movie.entity';
import { MovieSource } from '@entities/movie-source.entity';
import { RefreshToken } from '@entities/refresh-token.entity';
import { Season } from '@entities/season.entity';
import { Storage } from '@entities/storage.entity';
import { SyncState } from '@entities/sync-state.entity';
import { TraktUser } from '@entities/trakt-user.entity';
import { TVShow } from '@entities/tvshow.entity';
import { TVShowTranslation } from '@entities/tvshow.entity';
import { User } from '@entities/user.entity';
import { AuditLogRepository } from '@repositories/audit-log.repository';
import { GenreRepository } from '@repositories/genre.repository';
import { MediaListRepository } from '@repositories/mediaList.repository';
import { MovieRepository } from '@repositories/movie.repository';
import { MovieSourceRepository } from '@repositories/movie-source.repository';
import { RefreshTokenRepository } from '@repositories/refresh-token.repository';
import { StorageRepository } from '@repositories/storage.repository';
import { SyncStateRepository } from '@repositories/syncState.repository';
import { TraktUserRepository } from '@repositories/trakt-user.repository';
import { TVShowRepository } from '@repositories/tvshow.repository';
import { UserRepository } from '@repositories/user.repository';
import type { EncryptionService } from '@services/encryption/encryption.service';

class DatabaseLogger extends AbstractLogger {
  protected writeLog(level: LogLevel, logMessage: LogMessage | LogMessage[]) {
    const messages = this.prepareLogMessages(logMessage, {
      highlightSql: true,
    });

    for (let message of messages) {
      switch (message.type ?? level) {
        case 'log':
        case 'schema-build':
        case 'migration':
          logger.debug('DATABASE', `[${message.type}] ${message.message}`);
          break;

        case 'info':
        case 'query':
          if (message.prefix) {
            logger.debug('DATABASE', `[${message.prefix}] ${message.message}`);
          } else {
            logger.debug('DATABASE', `${message.message}`);
          }
          break;

        case 'warn':
        case 'query-slow':
          if (message.prefix) {
            logger.warn('DATABASE', `[${message.prefix}] ${message.message}`);
          } else {
            logger.warn('DATABASE', `${message.message}`);
          }
          break;

        case 'error':
        case 'query-error':
          if (message.prefix) {
            logger.error('DATABASE', `[${message.prefix}] ${message.message}`);
          } else {
            logger.error('DATABASE', `${message.message}`);
          }
          break;
      }
    }
  }
}

export class Database {
  private readonly dataSource: DataSource;
  private mediaListRepository: MediaListRepository;
  private movieRepository: MovieRepository;
  private movieSourceRepository: MovieSourceRepository;
  private tvShowRepository: TVShowRepository;
  private genreRepository: GenreRepository;
  private userRepository: UserRepository;
  private refreshTokenRepository: RefreshTokenRepository;
  private auditLogRepository: AuditLogRepository;
  private syncStateRepository: SyncStateRepository;
  private traktUserRepository: TraktUserRepository;
  private storageRepository: StorageRepository;

  constructor(private readonly encryptionService: EncryptionService) {
    // Set up static encryption services for entities
    Movie.encryptionService = this.encryptionService;
    MovieSource.encryptionService = this.encryptionService;

    this.dataSource = new DataSource({
      type: 'sqlite',
      database: path.resolve(ENV('DATA_DIR'), 'database.sqlite'),
      entities: [
        Movie,
        MovieTranslation,
        MovieSource,
        TVShow,
        TVShowTranslation,
        Season,
        Episode,
        MediaList,
        Genre,
        GenreTranslation,
        User,
        RefreshToken,
        AuditLog,
        SyncState,
        TraktUser,
        Storage,
      ],
      synchronize: true,
      logger: new DatabaseLogger('all'),
      logging: true,
    });
  }

  public async initialize() {
    await this.dataSource.initialize();
    this.mediaListRepository = new MediaListRepository(this);
    this.movieSourceRepository = new MovieSourceRepository(this);
    this.movieRepository = new MovieRepository(this);
    this.tvShowRepository = new TVShowRepository(this.dataSource);
    this.genreRepository = new GenreRepository(this.dataSource);
    this.userRepository = new UserRepository(this.dataSource);
    this.refreshTokenRepository = new RefreshTokenRepository(this.dataSource);
    this.auditLogRepository = new AuditLogRepository(this.dataSource);
    this.syncStateRepository = new SyncStateRepository(this.dataSource);
    this.traktUserRepository = new TraktUserRepository(this.dataSource);
    this.storageRepository = new StorageRepository(this);
  }

  public async close(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }

  public getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
    return this.dataSource.getRepository<T>(entity);
  }

  public getSyncStateRepository(): SyncStateRepository {
    return this.syncStateRepository;
  }

  public getMovieRepository() {
    return this.movieRepository;
  }

  public getTVShowRepository() {
    return this.tvShowRepository;
  }

  public getSeasonRepository() {
    return this.dataSource.getRepository(Season);
  }

  public getEpisodeRepository() {
    return this.dataSource.getRepository(Episode);
  }

  public getMediaListRepository() {
    return this.mediaListRepository;
  }

  public getGenreRepository() {
    return this.genreRepository;
  }

  public getUserRepository() {
    return this.userRepository;
  }

  public getRefreshTokenRepository() {
    return this.refreshTokenRepository;
  }

  public getAuditLogRepository() {
    return this.auditLogRepository;
  }

  public getMovieSourceRepository() {
    return this.movieSourceRepository;
  }

  public getTraktUserRepository() {
    return this.traktUserRepository;
  }

  public getStorageRepository() {
    return this.storageRepository;
  }
}
