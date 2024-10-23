import { useGetCategoriesQuery } from '../../../../store/api/categories';
import { useGetListQuery } from '../../../../store/api/lists';
import { skipToken } from '@reduxjs/toolkit/query';
import { useCallback, useEffect, useState } from 'react';
import { scaleImage } from '../utils/scaleImage';

export const usePreloadHomeImages = () => {
  const { data: categories } = useGetCategoriesQuery();
  const { data: medias } = useGetListQuery(
    categories ? categories[0].id : skipToken
  );
  const [load, setLoad] = useState(false);
  useEffect(() => {
    if (medias && load) {
      medias.forEach((media) => {
        const img = new Image();
        img.src = scaleImage(media.images.backdrop);
      });
    }
  }, [medias, load]);

  return useCallback(() => {
    setLoad(true);
  }, []);
};
