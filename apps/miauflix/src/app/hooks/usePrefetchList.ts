import { usePrefetch } from '../../store/api/movies';

export const usePrefetchList = () => {
  const prefetchMovies = usePrefetch('getMovies');
  return (list: string) => {
    const [listType, listName] = list.split('/');
    if (listType === 'movies') {
      return prefetchMovies(listName);
    }
  };
};
