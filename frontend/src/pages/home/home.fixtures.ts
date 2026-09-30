import type { ListDto, MediaDto, MovieDto, TVShowDto } from '@miauflix/backend';

import tmdb83533 from '../../../../test-fixtures/providers/tmdb/3/movie/83533-append_to_response-translations,images-language-en.json';
import tmdb299534 from '../../../../test-fixtures/providers/tmdb/3/movie/299534-append_to_response-translations,images-language-en.json';
import tmdb445466 from '../../../../test-fixtures/providers/tmdb/3/movie/445466-append_to_response-translations,images-language-en.json';
import tmdb675871 from '../../../../test-fixtures/providers/tmdb/3/movie/675871-append_to_response-translations,images-language-en.json';
import tmdb687163 from '../../../../test-fixtures/providers/tmdb/3/movie/687163-append_to_response-translations,images-language-en.json';
import tmdb936075 from '../../../../test-fixtures/providers/tmdb/3/movie/936075-append_to_response-translations,images-language-en.json';
import tmdb969681 from '../../../../test-fixtures/providers/tmdb/3/movie/969681-append_to_response-translations,images-language-en.json';
import tmdb1032863 from '../../../../test-fixtures/providers/tmdb/3/movie/1032863-append_to_response-translations,images-language-en.json';
import tmdb1084242 from '../../../../test-fixtures/providers/tmdb/3/movie/1084242-append_to_response-translations,images-language-en.json';
import tmdb1084244 from '../../../../test-fixtures/providers/tmdb/3/movie/1084244-append_to_response-translations,images-language-en.json';
import tmdb1101383 from '../../../../test-fixtures/providers/tmdb/3/movie/1101383-append_to_response-translations,images-language-en.json';
import tmdb1137844 from '../../../../test-fixtures/providers/tmdb/3/movie/1137844-append_to_response-translations,images-language-en.json';
import tmdb1204680 from '../../../../test-fixtures/providers/tmdb/3/movie/1204680-append_to_response-translations,images-language-en.json';
import tmdb1226863 from '../../../../test-fixtures/providers/tmdb/3/movie/1226863-append_to_response-translations,images-language-en.json';
import tmdb1242898 from '../../../../test-fixtures/providers/tmdb/3/movie/1242898-append_to_response-translations,images-language-en.json';
import tmdb1275779 from '../../../../test-fixtures/providers/tmdb/3/movie/1275779-append_to_response-translations,images-language-en.json';
import tmdb1339713 from '../../../../test-fixtures/providers/tmdb/3/movie/1339713-append_to_response-translations,images-language-en.json';
import tmdb1368166 from '../../../../test-fixtures/providers/tmdb/3/movie/1368166-append_to_response-translations,images-language-en.json';
import tmdb1423191 from '../../../../test-fixtures/providers/tmdb/3/movie/1423191-append_to_response-translations,images-language-en.json';
import tmdb1607127 from '../../../../test-fixtures/providers/tmdb/3/movie/1607127-append_to_response-translations,images-language-en.json';
import popularMoviesFixture from '../../../../test-fixtures/providers/trakt/movies/popular-limit-50-page-1.json';
import trendingMoviesFixture from '../../../../test-fixtures/providers/trakt/movies/trending-limit-50-page-1.json';
import popularShowsFixture from '../../../../test-fixtures/providers/trakt/shows/popular-limit-50-page-1.json';
import { type HomeFixtureAssets, homeFixtureAssets, showFallbackAssets } from './home.assets';

interface TmdbMovieFixture {
  data: {
    overview: string;
    tagline?: string;
    popularity: number;
    vote_average: number;
    release_date: string;
    runtime?: number | null;
    genres?: Array<{ name: string }> | null;
  };
}

interface TraktMediaEntry {
  title: string;
  year: number;
  ids: { tmdb: number };
}

const movieDetailsById: Record<number, TmdbMovieFixture> = {
  687163: tmdb687163,
  1339713: tmdb1339713,
  1368166: tmdb1368166,
  1084242: tmdb1084242,
  83533: tmdb83533,
  1275779: tmdb1275779,
  936075: tmdb936075,
  969681: tmdb969681,
  1226863: tmdb1226863,
  1242898: tmdb1242898,
  1032863: tmdb1032863,
  1101383: tmdb1101383,
  1423191: tmdb1423191,
  1137844: tmdb1137844,
  1084244: tmdb1084244,
  675871: tmdb675871,
  1204680: tmdb1204680,
  1607127: tmdb1607127,
  445466: tmdb445466,
  299534: tmdb299534,
};

const popularMovieEntries = popularMoviesFixture.data.slice(0, 10) as TraktMediaEntry[];
const trendingMovieEntries = trendingMoviesFixture.data
  .slice(0, 10)
  .map(entry => entry.movie) as TraktMediaEntry[];
const popularShowEntries = popularShowsFixture.data.slice(0, 10) as TraktMediaEntry[];

function toMovie(entry: TraktMediaEntry, assets: HomeFixtureAssets): MovieDto {
  const detail = movieDetailsById[entry.ids.tmdb];
  if (!detail) throw new Error(`Missing TMDB fixture for movie ${entry.ids.tmdb}`);
  const movie = detail.data;
  return {
    _type: 'movie',
    id: entry.ids.tmdb,
    mediaId: entry.ids.tmdb,
    title: entry.title,
    overview: movie.overview,
    tagline: movie.tagline,
    poster: assets.poster,
    backdrop: assets.backdrop,
    logo: assets.logo,
    genres: movie.genres?.map(genre => genre.name) ?? [],
    popularity: movie.popularity,
    rating: movie.vote_average,
    releaseDate: movie.release_date || `${entry.year}-01-01`,
    runtime: movie.runtime ?? undefined,
  };
}

function toShow(entry: TraktMediaEntry, index: number): TVShowDto {
  const assets = showFallbackAssets[index % showFallbackAssets.length];
  return {
    _type: 'tvshow',
    id: entry.ids.tmdb,
    mediaId: entry.ids.tmdb,
    name: entry.title,
    overview: 'Featured in the popular shows fixture.',
    poster: assets.poster,
    backdrop: assets.backdrop,
    genres: [],
    popularity: 0,
    rating: 0,
    firstAirDate: `${entry.year}-01-01`,
  };
}

const popularMovies = popularMovieEntries.map(entry =>
  toMovie(entry, homeFixtureAssets[entry.ids.tmdb])
);
const trendingMovies = trendingMovieEntries.map(entry =>
  toMovie(entry, homeFixtureAssets[entry.ids.tmdb])
);
const popularShows = popularShowEntries.map(toShow);

export const homeMedia = [...popularMovies, ...trendingMovies];

export const homeCategories = [
  { name: 'Popular Movies', slug: 'popular-movies', description: '', url: '/list/popular-movies' },
  {
    name: 'Trending Movies',
    slug: 'trending-movies',
    description: '',
    url: '/list/trending-movies',
  },
  { name: 'Popular Shows', slug: 'popular-shows', description: '', url: '/list/popular-shows' },
] satisfies ListDto[];

export const mediaForCategory = {
  'popular-movies': popularMovies,
  'trending-movies': trendingMovies,
  'popular-shows': popularShows,
} satisfies Record<string, MediaDto[]>;

export const mediaForCategoryBySlug: Record<string, MediaDto[]> = mediaForCategory;
export const popularCategories = homeCategories.slice(1);
