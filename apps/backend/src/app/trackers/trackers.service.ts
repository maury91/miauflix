import { Global, Injectable, Module } from '@nestjs/common';
import { TheRarBgService } from './therarbg.service';
import { Torrent } from '../jackett/jackett.types';
import { TypedEventEmitter } from '../utils/eventEmitter';
import { HttpModule } from '@nestjs/axios';
import { JackettService } from '../jackett/jackett.service';

interface TVShowQuery {
  title: string;
  imdbId: string;
}

interface EpisodeQuery {
  title: string;
  imdbId: string;
  season: number;
  episode: number;
}

interface SearchQuery {
  query: TVShowQuery;
  priority: number;
}

type TrackerEvents = {
  torrent: (torrent: Torrent) => void;
  queryCompleted: (query: TVShowQuery, torrents: Torrent[]) => void;
};

@Injectable()
export class TrackersService extends TypedEventEmitter<TrackerEvents> {
  private readonly searchQueue: SearchQuery[] = [];
  private readonly runnersCount = 5;

  constructor(private readonly theRarBgService: TheRarBgService) {
    super();
    for (let i = 0; i < this.runnersCount; i++) {
      this.searchRunner();
    }
  }

  private compareTitle = (title: string, queryTitle: string) => {
    const titleParts = title
      .toLowerCase()
      .split(' ')
      .filter((part) => part.length >= 2);
    const queryParts = queryTitle
      .toLowerCase()
      .split(' ')
      .filter((part) => part.length >= 2);
    let matches = 0,
      lastPartFound = 0;
    for (const queryPart of queryParts) {
      for (let i = lastPartFound; i < titleParts.length; i++) {
        if (titleParts[i] === queryPart) {
          matches++;
          lastPartFound = i + 1;
          break;
        }
      }
    }
    return (
      matches / queryParts.length > 0.8 &&
      queryParts.length / titleParts.length >= 0.4
    );
  };

  private filterTorrents = async (torrents: Torrent[], query: TVShowQuery) => {
    const foundTorrents = torrents.filter((torrent) => {
      if (torrent.imdb) {
        return torrent.imdb === query.imdbId;
      }
      return this.compareTitle(torrent.title, query.title);
    });

    for (const torrent of foundTorrents) {
      this.emit('torrent', torrent);
    }
    this.emit('queryCompleted', query, foundTorrents);
  };

  private searchWithJackett = async (query: Required<TVShowQuery>) => {
    // ToDo: Implement search with Jackett
  };

  private searchRunner = async () => {
    this.searchQueue.sort((a, b) => a.priority - b.priority);
    const searchQuery = this.searchQueue.shift();
    if (!searchQuery) {
      setTimeout(this.searchRunner, 100);
      return;
    }
    try {
      try {
        const torrents = await this.theRarBgService.getTorrentsByIMDB(
          searchQuery.query.imdbId
        );
        // ToDo: Remove console.log
        console.log(
          'Found torrents for',
          searchQuery.query.title,
          torrents.length
        );
        this.filterTorrents(torrents, searchQuery.query);
      } catch (err) {
        if (err.message === 'IMDB ID not found') {
          console.warn('IMDB ID not found for', searchQuery.query.title);
          // Use Jackett as fallback
          // const { season, episode, imdbId, title } = searchQuery.query;
          // if (season !== undefined && episode !== undefined) {
          //   this.searchWithJackett({
          //     title,
          //     season,
          //     episode,
          //     imdbId,
          //   });
          // }
          return;
        }
      }
    } catch (e) {
      console.error('Error searching for', searchQuery.query.title, e);
      this.searchQueue.push(searchQuery);
    }
  };

  public searchTVShow(query: TVShowQuery, priority = 65000) {
    return new Promise((resolve) => {
      function waitForResult(completedQuery: TVShowQuery, torrents: Torrent[]) {
        if (completedQuery.imdbId === query.imdbId) {
          resolve(torrents);
          this.off('queryCompleted', waitForResult);
        }
      }
      this.on('queryCompleted', waitForResult);
      const exists = this.searchQueue.find(
        (q) => q.query.imdbId === query.imdbId
      );
      if (exists) {
        exists.priority = Math.min(exists.priority, priority);
        return;
      }
      this.searchQueue.push({ query, priority });
    });
  }
}

@Global()
@Module({
  imports: [HttpModule],
  providers: [JackettService, TheRarBgService, TrackersService],
  exports: [TrackersService],
})
export class TrackersServiceModule {}
