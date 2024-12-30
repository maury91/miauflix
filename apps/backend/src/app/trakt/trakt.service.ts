import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TraktApi } from './trakt.api';
import { UserData } from '../user/user.data';
import { MoviesService } from '../movies/movies.service';
import { ShowsService } from '../shows/shows.service';

@Injectable()
export class TraktService {
  constructor(
    private readonly traktApi: TraktApi,
    private readonly userData: UserData,
    private readonly movieService: MoviesService,
    private readonly showsService: ShowsService
  ) {}

  static statusToAction(status: 'paused' | 'watching' | 'stopped') {
    switch (status) {
      case 'paused':
        return 'pause';
      case 'watching':
        return 'start';
      case 'stopped':
        return 'stop';
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async syncProgress() {
    console.log('Syncing progress...');
    // Go through all users
    const loggedUsers = await this.userData.getLoggedUsers();

    for (const user of loggedUsers) {
      // Intentionally sequential
      const moviesTraktProgress = await this.traktApi.getProgress(
        user.accessToken,
        'movies'
      );
      const episodesTraktProgress = await this.traktApi.getProgress(
        user.accessToken,
        'episodes'
      );
      const progressInDb = await this.userData.getProgress(user.id);

      // Sync from Trakt to Local DB
      for (const movieProgress of moviesTraktProgress) {
        const movieInDb = progressInDb.movies.find(
          (m) => m.movieSlug === movieProgress.movie.ids.slug
        );
        const movie = await this.movieService.getMovie(
          movieProgress.movie.ids.slug
        );
        if (movieInDb) {
          // Check if progress is newer
          if (
            new Date(movieInDb.updatedAt) < new Date(movieProgress.paused_at)
          ) {
            // Get movie
            await this.userData.updateMovieProgress(
              user.id,
              movieInDb.movieId,
              Math.floor(movieProgress.progress * movie.runtime),
              'paused',
              movie.ids.slug,
              true
            );
          }
        } else {
          const movie = await this.movieService.getMovie(
            movieProgress.movie.ids.slug
          );
          await this.userData.updateMovieProgress(
            user.id,
            movie.id,
            Math.floor(movieProgress.progress * movie.runtime),
            'paused',
            movie.ids.slug,
            true
          );
        }
      }

      for (const episodeProgress of episodesTraktProgress) {
        const episodeInDb = progressInDb.episodes.find(
          (e) => e.traktId === episodeProgress.episode.ids.trakt
        );
        const show = await this.showsService.getShow(
          episodeProgress.show.ids.slug
        );
        const season = await this.showsService.getShowSeason(
          show.id,
          episodeProgress.episode.season
        );
        const episode = season.episodes.find(
          (e) => e.traktId === episodeProgress.episode.ids.trakt
        );
        if (episodeInDb) {
          if (
            new Date(episodeInDb.updatedAt) <
            new Date(episodeProgress.paused_at)
          ) {
            await this.userData.updateEpisodeProgress(
              user.id,
              episodeInDb.episodeId,
              Math.floor(episodeProgress.progress * episode.runtime),
              'paused',
              episode.traktId,
              true
            );
          }
        } else {
          await this.userData.updateEpisodeProgress(
            user.id,
            episode.id,
            Math.floor(episodeProgress.progress * episode.runtime),
            'paused',
            episode.traktId,
            true
          );
        }
      }

      // Sync from Local DB to Trakt
      //   const unSyncedProgress = await this.userData.getUnSyncedProgress(user.id);
      //   for (const episodeProgress of unSyncedProgress.movies) {
      //     await this.traktApi.trackPlayback(
      //       episodeProgress.movieSlug,
      //       user.accessToken,
      //       'movie',
      //       TraktService.statusToAction(episodeProgress.status),
      //       episodeProgress.progress / episodeProgress.runtime
      //     );
      //   }
      //
      //   for (const episodeProgress of unSyncedProgress.episodes) {
      //     await this.traktApi.trackPlayback(
      //       episodeProgress.traktId.toString(),
      //       user.accessToken,
      //       'episode',
      //       TraktService.statusToAction(episodeProgress.status),
      //       episodeProgress.progress / episodeProgress.runtime
      //     );
      //   }
    }
  }
}
