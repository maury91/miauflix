import path from 'path';
import { DataSource } from 'typeorm';

import { AuditLog } from '@entities/audit-log.entity';
import { Episode } from '@entities/episode.entity';
import { Genre, GenreTranslation } from '@entities/genre.entity';
import { MediaList } from '@entities/list.entity';
import { Movie, MovieTranslation } from '@entities/movie.entity';
import { MovieSource } from '@entities/movie-source.entity';
import { RefreshToken } from '@entities/refresh-token.entity';
import { Season } from '@entities/season.entity';
import { SyncState } from '@entities/sync-state.entity';
import { TVShow } from '@entities/tvshow.entity';
import { TVShowTranslation } from '@entities/tvshow.entity';
import { User } from '@entities/user.entity';
import { AuditLogRepository } from '@repositories/audit-log.repository';
import { GenreRepository } from '@repositories/genre.repository';
import { MediaListRepository } from '@repositories/mediaList.repository';
import { MovieRepository } from '@repositories/movie.repository';
import { MovieSourceRepository } from '@repositories/movie-source.repository';
import { RefreshTokenRepository } from '@repositories/refresh-token.repository';
import { SyncStateRepository } from '@repositories/syncState.repository';
import { TVShowRepository } from '@repositories/tvshow.repository';
import { UserRepository } from '@repositories/user.repository';
import { ENV } from '@constants';

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

  constructor() {
    this.dataSource = new DataSource({
      type: 'sqlite',
      database: path.resolve(ENV('DATA_DIR'), 'database.sqlite'),
      entities: [
        Movie,
        MovieTranslation,
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
        MovieSource,
      ],
      synchronize: true,
    });
  }

  public async initialize() {
    await this.dataSource.initialize();
    this.mediaListRepository = new MediaListRepository(this.dataSource);
    this.movieRepository = new MovieRepository(this.dataSource);
    this.movieSourceRepository = new MovieSourceRepository(this.dataSource);
    this.tvShowRepository = new TVShowRepository(this.dataSource);
    this.genreRepository = new GenreRepository(this.dataSource);
    this.userRepository = new UserRepository(this.dataSource);
    this.refreshTokenRepository = new RefreshTokenRepository(this.dataSource);
    this.auditLogRepository = new AuditLogRepository(this.dataSource);
    this.syncStateRepository = new SyncStateRepository(this.dataSource);
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
}
