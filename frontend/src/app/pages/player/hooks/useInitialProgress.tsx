import { useAppSelector } from '../../../../store/store';

export const useInitialProgress = () => {
  const mediaId = useAppSelector(state => state.stream.id);
  const mediaType = useAppSelector(state => state.stream.type);
  const showSlug = useAppSelector(state => state.stream.showSlug);
  const seasonNum = useAppSelector(state => state.stream.season);
  const episodeNum = useAppSelector(state => state.stream.episode);
  const initialPosition = useAppSelector(
    state =>
      (mediaType === 'movie'
        ? state.resume.movieProgress[mediaId]
        : state.resume.showProgress[showSlug]?.[`${seasonNum}-${episodeNum}`]) ?? 0
  );

  return initialPosition;
};
