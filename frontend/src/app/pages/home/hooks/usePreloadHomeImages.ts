import { useGetListsQuery, useGetListQuery } from '@store/api/lists';
import { skipToken } from '@reduxjs/toolkit/query';
import { useCallback, useEffect, useState } from 'react';
import { scaleImage } from '../utils/scaleImage';

export const usePreloadHomeImages = () => {
  const { data: categories } = useGetListsQuery();
  const { data } = useGetListQuery(
    categories
      ? {
          category: categories[0].slug,
          page: 0,
        }
      : skipToken
  );
  const [load, setLoad] = useState(false);
  useEffect(() => {
    if (data && data.results && load) {
      data.results.forEach(media => {
        const img = new Image();
        img.src = scaleImage(media.backdrop);
      });
    }
  }, [data, load]);

  return useCallback(() => {
    setLoad(true);
  }, []);
};
