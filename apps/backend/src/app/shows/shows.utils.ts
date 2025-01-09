import { Show } from '../../database/entities/show.entity';
import { ShowDto } from '@miauflix/types';

export const showToDto = (show: Show): ShowDto => ({
  type: 'show',
  id: show.slug,
  title: show.title,
  year: show.year,
  ids: {
    slug: show.slug,
    imdb: show.imdbId,
    tmdb: show.tmdbId,
    tvdb: show.tvdbId,
  },
  images: {
    poster: show.poster,
    backdrop: show.backdrop,
    backdrops: show.backdrops,
    logos: show.logos,
  },
});
