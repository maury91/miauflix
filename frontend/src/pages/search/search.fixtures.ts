import type { SearchResultDto } from '@miauflix/backend';
import { initialSearchState, type SearchState } from '@store/slices/search';

import { homeFixtureAssets } from '../home/home.assets';

const poster = (mediaId: keyof typeof homeFixtureAssets) => homeFixtureAssets[mediaId].poster;

export const searchResultsFixture: SearchResultDto[] = [
  { mediaId: 687163, title: 'Dune', releaseDate: '2021-09-15', rating: 8 },
  { mediaId: 1339713, title: 'Dune: Part Two', releaseDate: '2024-02-27', rating: 8.5 },
  { mediaId: 1368166, title: 'Dune: Prophecy', releaseDate: '2024-11-17', rating: 7.8, tv: true },
  { mediaId: 1084242, title: 'Children of Dune', releaseDate: '2003-03-16', rating: 7.1, tv: true },
  { mediaId: 299536, title: 'Dune Messiah', releaseDate: '2004-01-01', rating: 7.3 },
  { mediaId: 157336, title: 'Dune World', releaseDate: '2019-01-01', rating: 6.4 },
].map(({ mediaId, tv, ...item }) => ({
  ...item,
  _type: tv ? ('tvshow' as const) : ('movie' as const),
  mediaId,
  overview: '',
  poster: poster(mediaId as keyof typeof homeFixtureAssets),
  backdrop: '',
}));

export const searchStateFixture: SearchState = {
  ...initialSearchState,
  query: 'Dune',
  status: 'ready',
  requestId: 1,
  results: searchResultsFixture,
  page: 1,
  totalPages: 2,
  totalResults: 24,
  details: {
    'movie:687163': { _type: 'movie', mediaId: 687163, runtime: 155 },
    'movie:1339713': { _type: 'movie', mediaId: 1339713, runtime: 166 },
    'tvshow:1368166': { _type: 'tvshow', mediaId: 1368166, seasonCount: 1 },
    'tvshow:1084242': { _type: 'tvshow', mediaId: 1084242, seasonCount: 1 },
  },
  recents: ['Dune', 'The Last of Us', 'Spider-Man', 'Silo', 'Rick and Morty'].map(query => ({
    kind: 'query' as const,
    query,
    searchedAt: '2026-10-01T00:00:00.000Z',
  })),
};
