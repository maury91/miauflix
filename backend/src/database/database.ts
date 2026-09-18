import { logger } from '@logger';
import path from 'path';
import type { EntityTarget, LogLevel, LogMessage, ObjectLiteral, Repository } from 'typeorm';
import { AbstractLogger, DataSource } from 'typeorm';

import { AuditLog } from '@entities/audit-log.entity';
import { BackgroundJob } from '@entities/background-job.entity';
import { Episode } from '@entities/episode.entity';
import { MediaList, MediaListItem } from '@entities/list.entity';
import { Movie } from '@entities/movie.entity';
import { MovieSource } from '@entities/movie-source.entity';
import { Progress } from '@entities/progress.entity';
import { RefreshToken } from '@entities/refresh-token.entity';
import { Season } from '@entities/season.entity';
import { Storage } from '@entities/storage.entity';
import { StreamingKey } from '@entities/streaming-key.entity';
import { TraktUser } from '@entities/trakt-user.entity';
import { TVShow } from '@entities/tvshow.entity';
import { User } from '@entities/user.entity';
import { AuditLogRepository } from '@repositories/audit-log.repository';
import { MediaListRepository } from '@repositories/mediaList.repository';
import { MovieRepository } from '@repositories/movie.repository';
import { MovieSourceRepository } from '@repositories/movie-source.repository';
import { ProgressRepository } from '@repositories/progress.repository';
import { RefreshTokenRepository } from '@repositories/refresh-token.repository';
import { StorageRepository } from '@repositories/storage.repository';
import { StreamingKeyRepository } from '@repositories/streaming-key.repository';
import { TraktUserRepository } from '@repositories/trakt-user.repository';
import { TVShowRepository } from '@repositories/tvshow.repository';
import { UserRepository } from '@repositories/user.repository';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import { EncryptionService } from '@services/encryption/encryption.service';

class DatabaseLogger extends AbstractLogger {
  protected writeLog(level: LogLevel, logMessage: LogMessage | LogMessage[]) {
    const messages = this.prepareLogMessages(logMessage, {
      highlightSql: true,
    });

    for (const message of messages) {
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
  private userRepository: UserRepository;
  private refreshTokenRepository: RefreshTokenRepository;
  private auditLogRepository: AuditLogRepository;
  private traktUserRepository: TraktUserRepository;
  private storageRepository: StorageRepository;
  private streamingKeyRepository: StreamingKeyRepository;
  private progressRepository: ProgressRepository;

  constructor(configurationService: ConfigurationService) {
    const encryptionService = new EncryptionService(
      configurationService.getOrThrow('SOURCE_SECURITY_KEY')
    );
    const dataDir = configurationService.getOrThrow('DATA_DIR');
    const databasePath = path.resolve(dataDir, 'database.sqlite');
    // Set up static encryption services for entities
    Movie.encryptionService = encryptionService;
    MovieSource.encryptionService = encryptionService;

    logger.debug('DATABASE', `Initializing database ${databasePath}`);

    this.dataSource = new DataSource({
      type: 'sqlite',
      database: databasePath,
      entities: [
        Movie,
        MovieSource,
        TVShow,
        Season,
        Episode,
        MediaList,
        MediaListItem,
        User,
        RefreshToken,
        AuditLog,
        BackgroundJob,
        TraktUser,
        Storage,
        StreamingKey,
        Progress,
      ],
      synchronize: false,
      logger: new DatabaseLogger('all'),
      logging: true,
    });
  }

  public async initialize() {
    await this.dataSource.initialize();
    await this.repairLegacyDuplicates();
    await this.dataSource.synchronize();
    this.mediaListRepository = new MediaListRepository(this);
    this.movieSourceRepository = new MovieSourceRepository(this);
    this.movieRepository = new MovieRepository(this);
    this.tvShowRepository = new TVShowRepository(this.dataSource);
    this.userRepository = new UserRepository(this.dataSource);
    this.refreshTokenRepository = new RefreshTokenRepository(this.dataSource);
    this.auditLogRepository = new AuditLogRepository(this.dataSource);
    this.traktUserRepository = new TraktUserRepository(this.dataSource);
    this.storageRepository = new StorageRepository(this);
    this.streamingKeyRepository = new StreamingKeyRepository(this);
    this.progressRepository = new ProgressRepository(this.dataSource);
  }

  private async repairLegacyDuplicates(): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

    try {
      const tvShowMetadata = this.dataSource.getMetadata(TVShow);
      const seasonMetadata = this.dataSource.getMetadata(Season);
      const episodeMetadata = this.dataSource.getMetadata(Episode);
      const tvShowTable = quote(tvShowMetadata.tableName);
      const seasonTable = quote(seasonMetadata.tableName);
      const episodeTable = quote(episodeMetadata.tableName);
      const tableNames = new Set(
        (
          (await runner.query(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?)`,
            [tvShowMetadata.tableName, seasonMetadata.tableName, episodeMetadata.tableName]
          )) as Array<{ name: string }>
        ).map(row => row.name)
      );

      if (tableNames.has(tvShowMetadata.tableName)) {
        const duplicateShows = (await runner.query(
          `SELECT "tmdbId" AS media_id FROM ${tvShowTable} GROUP BY "tmdbId" HAVING COUNT(*) > 1`
        )) as Array<{ media_id: number }>;
        for (const { media_id: mediaId } of duplicateShows) {
          const rows = (await runner.query(
            `SELECT "id", "watching" FROM ${tvShowTable} WHERE "tmdbId" = ? ORDER BY "updatedAt" DESC, "id" DESC`,
            [mediaId]
          )) as Array<{ id: number; watching: boolean | number }>;
          const [keep, ...duplicates] = rows;
          if (!keep) continue;
          if (duplicates.some(row => Boolean(row.watching))) {
            await runner.query(`UPDATE ${tvShowTable} SET "watching" = 1 WHERE "id" = ?`, [
              keep.id,
            ]);
          }
          for (const duplicate of duplicates) {
            if (tableNames.has(seasonMetadata.tableName)) {
              await runner.query(`UPDATE ${seasonTable} SET "tvShowId" = ? WHERE "tvShowId" = ?`, [
                keep.id,
                duplicate.id,
              ]);
            }
            await runner.query(`DELETE FROM ${tvShowTable} WHERE "id" = ?`, [duplicate.id]);
          }
        }
      }

      if (tableNames.has(seasonMetadata.tableName)) {
        const duplicateSeasons = (await runner.query(
          `SELECT "tvShowId" AS tv_show_id, "seasonNumber" AS season_number FROM ${seasonTable} GROUP BY "tvShowId", "seasonNumber" HAVING COUNT(*) > 1`
        )) as Array<{ tv_show_id: number; season_number: number }>;
        for (const { tv_show_id: tvShowId, season_number: seasonNumber } of duplicateSeasons) {
          const rows = (await runner.query(
            `SELECT "id" FROM ${seasonTable} WHERE "tvShowId" = ? AND "seasonNumber" = ? ORDER BY "updatedAt" DESC, "id" DESC`,
            [tvShowId, seasonNumber]
          )) as Array<{ id: number }>;
          const [keep, ...duplicates] = rows;
          if (!keep) continue;
          for (const duplicate of duplicates) {
            if (tableNames.has(episodeMetadata.tableName)) {
              await runner.query(`UPDATE ${episodeTable} SET "seasonId" = ? WHERE "seasonId" = ?`, [
                keep.id,
                duplicate.id,
              ]);
            }
            await runner.query(`DELETE FROM ${seasonTable} WHERE "id" = ?`, [duplicate.id]);
          }
        }

        if (tableNames.has(episodeMetadata.tableName)) {
          const duplicateEpisodes = (await runner.query(
            `SELECT "seasonId" AS season_id, "episodeNumber" AS episode_number FROM ${episodeTable} GROUP BY "seasonId", "episodeNumber" HAVING COUNT(*) > 1`
          )) as Array<{ season_id: number; episode_number: number }>;
          for (const { season_id: seasonId, episode_number: episodeNumber } of duplicateEpisodes) {
            const rows = (await runner.query(
              `SELECT "id" FROM ${episodeTable} WHERE "seasonId" = ? AND "episodeNumber" = ? ORDER BY "updatedAt" DESC, "id" DESC`,
              [seasonId, episodeNumber]
            )) as Array<{ id: number }>;
            const [, ...duplicates] = rows;
            for (const duplicate of duplicates) {
              await runner.query(`DELETE FROM ${episodeTable} WHERE "id" = ?`, [duplicate.id]);
            }
          }
        }
      }

      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  public async close(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }

  public getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
    return this.dataSource.getRepository<T>(entity);
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

  public getStreamingKeyRepository() {
    return this.streamingKeyRepository;
  }

  public getProgressRepository() {
    return this.progressRepository;
  }
}
