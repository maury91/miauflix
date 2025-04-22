import { logger } from "@logger";

import type { Movie } from "@entities/movie.entity";
import type { TVShow } from "@entities/tvshow.entity";

import type { ListService } from "./list.service";

export class ListSynchronizer {
  constructor(private readonly listService: ListService) {}

  async synchronize(): Promise<void> {
    const lists = await this.listService.getLists();
    for (const { slug } of lists) {
      logger.debug("Synchronizer", `Synchronizing list: ${slug}`);
      // This creates the list ( if it doesn't exist ) and also preloads the first page
      await this.listService.getListBySlug(slug);
      let pages = 1;
      let currentPage = 1;
      let allMedias: (Movie | TVShow)[] = [];
      do {
        const { pages: totalPages, medias } =
          await this.listService.getListContentFromApi(slug, currentPage);
        pages = totalPages;
        currentPage++;

        allMedias = allMedias
          .concat(medias)
          // Remove duplicates based on id
          .filter(
            ({ id }, index, arr) =>
              arr.findIndex((media) => media.id === id) === index,
          );
      } while (currentPage <= Math.min(pages, 6));
      // Not liking the idea of incremental loading, it can lead to problems where the list gets periodically empty
      await this.listService.updateListContent(slug, allMedias);
      logger.debug("Synchronizer", `List ${slug} synchronized`);
    }
    logger.debug("Synchronizer", `All lists synchronized`);
  }
}
