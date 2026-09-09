jest.mock('@logger');

import { createMockMovie, createMockMovieSource } from '@__test-utils__/mocks/movie.mock';
import { Quality } from '@miauflix/source-metadata-extractor';

import type { Database } from '@database/database';
import type { DownloadService } from '@services/download/download.service';
import type { MediaService } from '@services/media/media.service';
import type { SourceService } from '@services/source/source.service';

import { StreamService } from './stream.service';

describe('StreamService immediate source readiness', () => {
  it('resolves source metadata inline instead of waiting for a queue worker', async () => {
    const movie = createMockMovie();
    const pending = createMockMovieSource({ movieId: movie.id, file: undefined });
    const ready = createMockMovieSource({
      ...pending,
      file: Buffer.from('torrent'),
      quality: Quality.FHD,
    });
    const repository = { findById: jest.fn() };
    const database = {
      getMovieSourceRepository: jest.fn().mockReturnValue(repository),
    } as unknown as Database;
    const sourceService = {
      getSourcesForMovieWithOnDemandSearch: jest.fn().mockResolvedValue([pending]),
      getSourcesForMovie: jest.fn().mockResolvedValue([ready]),
      processSourceMetadata: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SourceService>;
    const mediaService = {
      getMovieById: jest.fn().mockResolvedValue(movie),
    } as unknown as jest.Mocked<MediaService>;
    const service = new StreamService(database, sourceService, {} as DownloadService, mediaService);

    await expect(service.getBestSourceForStreaming(movie.id, 'auto')).resolves.toEqual(ready);
    expect(sourceService.processSourceMetadata).toHaveBeenCalledWith(pending.id);
  });
});
