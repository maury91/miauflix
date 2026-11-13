import type { StorageInventoryResponse, StorageItemView } from '@mytypes/storage.types';
import type { ContentSourceRepository } from '@repositories/content-source.repository';
import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';
import { isVideoFile } from '@services/source/video-files';

export type StorageRemovalStatus = Awaited<
  ReturnType<MediaLoadClientService['removeStorageWithResult']>
>['status'];

export interface StorageInventoryServiceOptions {
  contentSources: Pick<ContentSourceRepository, 'findWithMovies'>;
  mediaLoadClient: Pick<MediaLoadClientService, 'getInventory' | 'removeStorageWithResult'>;
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
      (await this.contentSources.findWithMovies(inventory.items.map(item => item.sourceId))).map(
        source => [source.id, source]
      )
    );
    const items = inventory.items.map((storage): StorageItemView => {
      const source = sources.get(storage.sourceId);
      return {
        sourceId: storage.sourceId,
        title: source?.movies?.[0]?.movie?.title ?? `Download ${storage.sourceId}`,
        fileName: storage.requestedFiles.find(isVideoFile)?.split('/').pop() ?? null,
        quality: source?.quality ?? null,
        physicalBytes: storage.allocatedBytes,
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
