import { useGetCategoriesQuery } from '../../../../store/api/categories';
import { useGetListQuery } from '../../../../store/api/lists';
import { skipToken } from '@reduxjs/toolkit/query';
import { useCallback, useEffect, useState } from 'react';
import { scaleImage } from '../utils/scaleImage';

export const usePreloadHomeImages = () => {
  const { data: categories } = useGetCategoriesQuery();
  const { data } = useGetListQuery(
    categories
      ? {
          category: categories[0].id,
          page: 0,
        }
      : skipToken
  );
  const [load, setLoad] = useState(false);
  useEffect(() => {
    if (data && data.data && load) {
      data.data.forEach(media => {
        const img = new Image();
        img.src = scaleImage(media.images.backdrop);
      });
    }
  }, [data, load]);

  return useCallback(() => {
    setLoad(true);
  }, []);
};
