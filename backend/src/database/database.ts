import { logger } from '@logger';
import path from 'path';
import type {
  EntityManager,
  EntityTarget,
  LogLevel,
  LogMessage,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { AbstractLogger, DataSource } from 'typeorm';

import { AuditLog } from '@entities/audit-log.entity';
import { BackgroundJob } from '@entities/background-job.entity';
import { Episode } from '@entities/episode.entity';
import { MediaList, MediaListItem } from '@entities/list.entity';
import { Movie } from '@entities/movie.entity';
import { MovieSource } from '@entities/movie-source.entity';
import { Progress } from '@entities/progress.entity';
import { QrLoginRequest } from '@entities/qr-login-request.entity';
import { RefreshToken } from '@entities/refresh-token.entity';
import { Season } from '@entities/season.entity';
import { Storage } from '@entities/storage.entity';
import { StreamingKey } from '@entities/streaming-key.entity';
import { TVShow } from '@entities/tvshow.entity';
import { User } from '@entities/user.entity';
import { AuditLogRepository } from '@repositories/audit-log.repository';
import { MediaListRepository } from '@repositories/mediaList.repository';
import { MovieRepository } from '@repositories/movie.repository';
import { MovieSourceRepository } from '@repositories/movie-source.repository';
import { ProgressRepository } from '@repositories/progress.repository';
import { QrLoginRequestRepository } from '@repositories/qr-login-request.repository';
import { RefreshTokenRepository } from '@repositories/refresh-token.repository';
import { StorageRepository } from '@repositories/storage.repository';
import { StreamingKeyRepository } from '@repositories/streaming-key.repository';
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

const repositoryWrites = new Set<PropertyKey>([
  'save',
  'insert',
  'update',
  'upsert',
  'delete',
  'remove',
  'softDelete',
  'softRemove',
  'restore',
  'recover',
  'increment',
  'decrement',
  'clear',
  'updateAll',
  'deleteAll',
]);

export class Database {
  private readonly dataSource: DataSource;
  private transactionQueue: Promise<void> = Promise.resolve();
  private mediaListRepository: MediaListRepository;
  private movieRepository: MovieRepository;
  private movieSourceRepository: MovieSourceRepository;
  private tvShowRepository: TVShowRepository;
  private userRepository: UserRepository;
  private refreshTokenRepository: RefreshTokenRepository;
  private auditLogRepository: AuditLogRepository;
  private qrLoginRequestRepository: QrLoginRequestRepository;
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
        QrLoginRequest,
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
    await this.dataSource.synchronize();
    this.mediaListRepository = new MediaListRepository(this);
    this.movieSourceRepository = new MovieSourceRepository(this);
    this.movieRepository = new MovieRepository(this);
    this.tvShowRepository = new TVShowRepository(this);
    this.userRepository = new UserRepository(this);
    this.refreshTokenRepository = new RefreshTokenRepository(this);
    this.auditLogRepository = new AuditLogRepository(this);
    this.qrLoginRequestRepository = new QrLoginRequestRepository(this);
    this.storageRepository = new StorageRepository(this);
    this.streamingKeyRepository = new StreamingKeyRepository(this);
    this.progressRepository = new ProgressRepository(this.dataSource);
  }

  public async close(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }

  public getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
    const repository = this.dataSource.getRepository<T>(entity);
    // Direct mutations enter the same lane as transactions. Query-builder
    // mutations must call write() around execute(); transaction callbacks use
    // their EntityManager directly to avoid waiting on their own queue entry.
    return new Proxy(repository, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;
        if (repositoryWrites.has(property))
          return (...args: unknown[]) => this.write(() => value.apply(target, args));
        return value.bind(target);
      },
    });
  }

  /** Keep writes outside another operation's SQLite transaction. */
  public write<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.transactionQueue.then(operation);
    this.transactionQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  /** Serialize SQLite transactions because TypeORM's SQLite driver shares one connection. */
  public transaction<T>(operation: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.write(() => this.dataSource.transaction(operation));
  }

  public getMovieRepository() {
    return this.movieRepository;
  }

  public getTVShowRepository() {
    return this.tvShowRepository;
  }

  public getSeasonRepository() {
    return this.getRepository(Season);
  }

  public getEpisodeRepository() {
    return this.getRepository(Episode);
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

  public getQrLoginRequestRepository() {
    return this.qrLoginRequestRepository;
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
