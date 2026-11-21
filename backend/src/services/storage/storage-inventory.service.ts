import type { ContentSource } from '@entities/content-source.entity';
import type { Episode } from '@entities/episode.entity';
import type {
  StorageInventoryResponse,
  StorageItemView,
  StorageMediaKind,
} from '@mytypes/storage.types';
import type { ContentSourceRepository } from '@repositories/content-source.repository';
import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';
import { isVideoFile } from '@services/source/video-files';

export type StorageRemovalStatus = Awaited<
  ReturnType<MediaLoadClientService['removeStorageWithResult']>
>['status'];

export interface StorageInventoryServiceOptions {
  contentSources: Pick<ContentSourceRepository, 'findWithMedia'>;
  mediaLoadClient: Pick<MediaLoadClientService, 'getInventory' | 'removeStorageWithResult'>;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Which episodes a source holds, in a few words. */
function describeEpisodes(episodes: Episode[]): string {
  if (episodes.length === 1) {
    const [episode] = episodes as [Episode];
    const code = `S${pad(episode.season.seasonNumber)}E${pad(episode.episodeNumber)}`;
    return episode.name ? `${code} · ${episode.name}` : code;
  }
  const seasons = new Set(episodes.map(episode => episode.season.seasonNumber));
  return seasons.size === 1
    ? `Season ${[...seasons][0]} · ${episodes.length} episodes`
    : `${seasons.size} seasons · ${episodes.length} episodes`;
}

/** What a source holds, from the catalog: a movie first, else a show's episodes. */
function describeMedia(
  source: ContentSource | undefined,
  sourceId: number
): Pick<StorageItemView, 'image' | 'kind' | 'subtitle' | 'title'> {
  const movie = source?.movies?.[0]?.movie;
  if (movie)
    return {
      kind: 'movie',
      title: movie.title,
      subtitle: movie.releaseDate?.slice(0, 4) || null,
      image: movie.backdrop || movie.poster || null,
    };
  const episodes = (source?.episodes ?? [])
    .map(link => link.episode)
    .filter(episode => episode?.season?.tvShow)
    .sort(
      (a, b) => a.season.seasonNumber - b.season.seasonNumber || a.episodeNumber - b.episodeNumber
    );
  const show = episodes[0]?.season.tvShow;
  if (show) {
    // A show numbered by AniList entry is an anime (the catalog's season layout)
    const kind: StorageMediaKind = show.seasonLayoutVersion ? 'anime' : 'episode';
    return {
      kind,
      title: show.name,
      subtitle: describeEpisodes(episodes),
      image: show.backdrop || episodes[0]!.stillPath || show.poster || null,
    };
  }
  return { kind: 'unknown', title: `Download ${sourceId}`, subtitle: null, image: null };
}

/**
 * What media-load keeps on disk, joined with the catalog titles of the sources, for the admin
 * storage screen. Only display data leaves here: never hashes or magnet links.
 */
export class StorageInventoryService {
  private readonly contentSources: StorageInventoryServiceOptions['contentSources'];
  private readonly mediaLoadClient: StorageInventoryServiceOptions['mediaLoadClient'];

  constructor({ contentSources, mediaLoadClient }: StorageInventoryServiceOptions) {
    this.contentSources = contentSources;
    this.mediaLoadClient = mediaLoadClient;
  }

  async getInventory(): Promise<StorageInventoryResponse> {
    const inventory = await this.mediaLoadClient.getInventory();
    const sources = new Map(
      (await this.contentSources.findWithMedia(inventory.items.map(item => item.sourceId))).map(
        source => [source.id, source]
      )
    );
    const items = inventory.items.map((storage): StorageItemView => {
      const source = sources.get(storage.sourceId);
      return {
        sourceId: storage.sourceId,
        ...describeMedia(source, storage.sourceId),
        fileName: storage.requestedFiles.find(isVideoFile)?.split('/').pop() ?? null,
        quality: source?.quality ?? null,
        physicalBytes: storage.allocatedBytes,
        remuxBytes: storage.remuxBytes ?? 0,
        reservedBytes: storage.reservedBytes,
        progressPercent: storage.downloaded / 100,
        videoComplete: storage.videoComplete,
        activity: storage.activity,
        torrentLoaded: storage.torrentLoaded,
        activeStreams: storage.activeStreams,
        seedEndsAt: storage.seedEndsAt,
      };
    });
    return {
      summary: {
        physicalBytes: inventory.physicalBytes,
        storageBudgetBytes: inventory.storageBudgetBytes,
        reservedBytes: inventory.reservedBytes,
        chargedBytes: inventory.chargedBytes,
        filesystem: inventory.filesystem,
      },
      // Largest charge first (the service's order), then by title.
      items: items.sort(
        (a, b) =>
          (b.physicalBytes ?? 0) - (a.physicalBytes ?? 0) ||
          b.reservedBytes - a.reservedBytes ||
          a.title.localeCompare(b.title)
      ),
    };
  }

  async remove(sourceId: number): Promise<StorageRemovalStatus> {
    return (await this.mediaLoadClient.removeStorageWithResult(sourceId)).status;
  }
}
