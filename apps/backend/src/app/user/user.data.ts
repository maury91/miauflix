import { Global, Injectable, Module } from '@nestjs/common';
import { AccessToken } from '../database/entities/accessToken.entity';
import { User, UserCreationAttributes } from '../database/entities/user.entity';
import { MovieProgressDto, ShowProgressDto, UserDto } from '@miauflix/types';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Not, Raw, Repository } from 'typeorm';
import { movieToDto } from '../movies/movies.utils';
import { showToDto } from '../shows/shows.utils';
import { EpisodeProgress } from '../database/entities/episode.progress.entity';
import { MovieProgress } from '../database/entities/movie.progress.entity';

@Injectable()
export class UserData {
  constructor(
    @InjectRepository(User) private readonly userModel: Repository<User>,
    @InjectRepository(EpisodeProgress)
    private readonly episodeProgressModel: Repository<EpisodeProgress>,
    @InjectRepository(MovieProgress)
    private readonly movieProgressModel: Repository<MovieProgress>,
    @InjectRepository(AccessToken)
    private readonly accessTokenModel: Repository<AccessToken>
  ) {}

  async getAccessTokenByUserId(userId: number): Promise<AccessToken | null> {
    return await this.accessTokenModel.findOne({
      where: {
        userId,
      },
    });
  }

  public async getProgress(userId: number) {
    const user = await this.userModel.findOne({
      where: {
        id: userId,
      },
      relations: {
        episodeProgress: true,
        movieProgress: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      episodes: user.episodeProgress.map((progress) => ({
        episodeId: progress.episodeId,
        progress: progress.progress,
        traktId: progress.traktId,
        status: progress.status,
        updatedAt: progress.updatedAt.toISOString(),
      })),
      movies: user.movieProgress.map((progress) => ({
        movieId: progress.movieId,
        progress: progress.progress,
        movieSlug: progress.movie.slug,
        status: progress.status,
        updatedAt: progress.updatedAt.toISOString(),
      })),
    };
  }

  public async getProgressWithMedias(userId: number) {
    const user = await this.userModel.findOne({
      where: {
        id: userId,
      },
      relations: {
        episodeProgress: {
          episode: {
            show: true,
          },
        },
        movieProgress: {
          movie: true,
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const shows = user.episodeProgress.map((progress): ShowProgressDto => {
      return {
        type: 'episode',
        show: showToDto(progress.episode.show),
        // Progress in seconds, Runtime in minute, divide by 60 to get minutes and multiply by 100 to get percentage
        progress: (progress.progress * 5) / (progress.episode.runtime * 3),
        progressAbs: progress.progress,
        episode: progress.episode.number,
        season: progress.episode.seasonNumber,
        pausedAt: progress.updatedAt.toISOString(),
      };
    });

    const movies = user.movieProgress.map(
      (movieProgress): MovieProgressDto => ({
        type: 'movie' as const,
        progress:
          (movieProgress.progress * 5) / (movieProgress.movie.runtime * 3),
        progressAbs: movieProgress.progress,
        movie: movieToDto(movieProgress.movie),
        pausedAt: movieProgress.updatedAt.toISOString(),
      })
    );

    return [...shows, ...movies].sort(
      (a, b) => new Date(a.pausedAt).getTime() - new Date(b.pausedAt).getTime()
    );
  }

  static actionToStatus(action: 'start' | 'pause' | 'stop') {
    switch (action) {
      case 'start':
        return 'watching';
      case 'pause':
        return 'paused';
      case 'stop':
        return 'stopped';
    }
  }

  public async updateEpisodeProgress(
    userId: number,
    episodeId: number,
    progress: number,
    status: 'watching' | 'stopped' | 'paused',
    traktId: number,
    synced = false
  ) {
    return this.episodeProgressModel.upsert(
      {
        userId,
        episodeId,
        progress,
        status,
        synced,
        traktId,
      },
      ['userId', 'episodeId']
    );
  }

  public async updateMovieProgress(
    userId: number,
    movieId: number,
    progress: number,
    status: 'watching' | 'stopped' | 'paused',
    slug: string,
    synced = false
  ) {
    return this.movieProgressModel.upsert(
      {
        userId,
        movieId,
        progress,
        status,
        synced,
        slug,
      },
      ['userId', 'movieId']
    );
  }

  public async getUnSyncedProgress(userId: number) {
    const unSyncedEpisodes = await this.episodeProgressModel.find({
      where: {
        userId,
        synced: false,
      },
      relations: {
        episode: true,
      },
    });
    const unSyncedMovies = await this.movieProgressModel.find({
      where: {
        userId,
        synced: false,
      },
      relations: {
        movie: true,
      },
    });

    return {
      episodes: unSyncedEpisodes.map((episode) => ({
        progress: episode.progress,
        runtime: episode.episode.runtime,
        status: episode.status,
        traktId: episode.traktId,
      })),
      movies: unSyncedMovies.map((movie) => ({
        progress: movie.progress,
        runtime: movie.movie.runtime,
        status: movie.status,
        movieSlug: movie.slug,
      })),
    };
  }

  public async createUser(user: UserCreationAttributes): Promise<User> {
    const maybeUser = await this.userModel.findOne({
      where: {
        slug: user.slug,
      },
    });
    if (maybeUser) {
      const existingToken = await this.accessTokenModel.find({
        where: {
          userId: maybeUser.id,
        },
      });
      if (existingToken.length > 1) {
        await this.accessTokenModel.delete({
          userId: maybeUser.id,
          id: Not(existingToken[0].id),
        });
      }
      if (existingToken.length) {
        await this.accessTokenModel.update(
          {
            userId: maybeUser.id,
          },
          {
            ...user.accessTokens[0],
          }
        );
      } else {
        await this.accessTokenModel.insert({
          ...user.accessTokens[0],
          userId: maybeUser.id,
        });
      }
      return await this.userModel.findOne({
        where: {
          slug: user.slug,
        },
        relations: {
          accessTokens: true,
        },
      });
    }
    return await this.userModel.save(user);
  }

  public async findUserByDeviceCode(deviceCode: string): Promise<User | null> {
    return await this.userModel.findOne({
      where: {
        accessTokens: {
          deviceCode,
        },
      },
      relations: ['accessTokens'],
    });
  }

  public async getUsers(): Promise<UserDto[]> {
    return await this.userModel.find({
      select: ['id', 'name', 'slug'],
    });
  }

  public async getLoggedUsers() {
    // Get non expired tokens
    const validAccessTokens = await this.accessTokenModel.find({
      where: {
        createdAt: Raw(
          (alias) => `${alias} > NOW() - "expiresIn" * INTERVAL '1s'`
        ),
      },
      relations: ['user'],
    });
    return validAccessTokens
      .map((accessToken) => ({
        id: accessToken.user.id,
        name: accessToken.user.name,
        slug: accessToken.user.slug,
        accessToken: accessToken.accessToken,
        expiresAt:
          accessToken.createdAt.getTime() + accessToken.expiresIn * 1000,
      }))
      .sort((a, b) => b.expiresAt - a.expiresAt)
      .filter(
        (user, index, self) => self.findIndex((u) => u.id === user.id) === index
      );
  }

  public async getUserAccessToken(userId: number) {
    const accessTokenData = await this.accessTokenModel.findOne({
      select: ['accessToken'],
      where: {
        userId,
      },
    });

    if (!accessTokenData) {
      throw new Error('User has no access token');
    }

    return accessTokenData.accessToken;
  }

  public async getExpiringTokens(): Promise<AccessToken[]> {
    const accessTokens = await this.accessTokenModel.find();
    return accessTokens.filter((accessToken) => {
      // If expires in less than 5 days
      return (
        accessToken.createdAt.getTime() + accessToken.expiresIn * 1000 <
        Date.now() + 1000 * 60 * 60 * 24 * 5
      );
    });
  }

  public async updateToken(token: AccessToken) {
    await this.accessTokenModel.update(token.id, token);
  }
}

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      AccessToken,
      EpisodeProgress,
      MovieProgress,
    ]),
  ],
  providers: [UserData],
  exports: [UserData, TypeOrmModule],
})
export class UserDataModule {}
