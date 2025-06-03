import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useGetListQuery } from '../../../../store/api/lists';
import styled from 'styled-components';
import { scaleImage } from '../utils/scaleImage';
import { CategoryDto, MediaDto } from '@miauflix/types';
import { useAppDispatch, useAppSelector } from '../../../../store/store';
import { setSelectedIndexForCategory, setSelectedMedia } from '../../../../store/slices/home';
import { useMediaBoxSizes } from '../hooks/useMediaBoxSizes';
import { MEDIA_BOX_HEIGHT } from './mediaBox';
import { skipToken } from '@reduxjs/toolkit/query';
import { CONTINUE_WATCHING_CATEGORY, HOME_PREFIX } from '../consts';
import { CATEGORY_CONTAINER_TOP_MASK } from './categoriesContainer';
import { Slider } from '../../../components/slider';
import { useGetProgressQuery } from '../../../../store/api/progress';

export const SLIDER_MARGIN = 10;

const CategorySliderContainer = styled.div<{
  margin: number;
  index: number;
}>`
  position: absolute;
  left: ${props => props.margin}px;
  right: 0;
  top: ${props => props.index * (MEDIA_BOX_HEIGHT + SLIDER_MARGIN) + CATEGORY_CONTAINER_TOP_MASK}vh;
  height: ${MEDIA_BOX_HEIGHT}vh;
`;

const CategoryTitle = styled.h3`
  height: 5vh;
  margin: 0 0 1vh;
`;

interface ListHookReturn {
  data: (MediaDto | null)[];
  updateSelected: (selected: number) => void;
  mediaCount: number;
}

const useInfiniteList = (category: string, skip = false): ListHookReturn => {
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const previousList = useGetListQuery(
    page >= 1 && !skip ? { category, page: page - 1 } : skipToken
  );
  const currentList = useGetListQuery(!skip ? { category, page } : skipToken);
  const nextList = useGetListQuery(
    page + 1 < totalPages && !skip ? { category, page: page + 1 } : skipToken
  );

  const mediaCount = currentList.data?.total ?? 0;
  const pagesCount = currentList.data?.totalPages ?? 0;
  const pageSize = currentList.data?.pageSize ?? 1;

  useEffect(() => {
    setTotalPages(pagesCount);
  }, [pagesCount]);

  const data = useMemo(() => {
    const combinedData: (MediaDto | null)[] = new Array(Math.max(pageSize * (page - 1), 0)).fill(
      null
    );
    for (const data of [
      page === 0 ? { data: [] } : previousList.data,
      currentList.data,
      nextList.data,
    ]) {
      if (data) {
        combinedData.push(...data.data);
      }
    }
    return combinedData;
  }, [pageSize, page, previousList.data, currentList.data, nextList.data]);

  const updateSelected = useCallback(
    (selected: number) => {
      setPage(Math.floor(selected / pageSize));
    },
    [pageSize]
  );

  return {
    data,
    updateSelected,
    mediaCount,
  };
};

const SPECIAL_CATEGORIES = [CONTINUE_WATCHING_CATEGORY];

const useSpecialList = (category: string): ListHookReturn => {
  const userId = useAppSelector(state => state.app.currentUserId);
  const { data: progressCategory } = useGetProgressQuery(
    category === CONTINUE_WATCHING_CATEGORY ? userId : skipToken
  );

  if (progressCategory) {
    const data = progressCategory
      .map(media => (media.type === 'movie' ? media.movie : media.show))
      .filter((media, index, arr) => arr.findIndex(({ id }) => id === media.id) === index)
      .sort();
    return {
      data,
      updateSelected: () => {
        // nothing
      },
      mediaCount: data.length,
    };
  }

  return {
    data: [],
    updateSelected: () => {
      // nothing
    },
    mediaCount: 0,
  };
};

const useSpecialCategories = (category: string) => {
  const skipNormalCategory = SPECIAL_CATEGORIES.includes(category);
  const normalListResult = useInfiniteList(category, skipNormalCategory);
  const specialListResult = useSpecialList(CONTINUE_WATCHING_CATEGORY);

  if (SPECIAL_CATEGORIES.includes(category)) {
    return specialListResult;
  }
  return normalListResult;
};

export const CategorySlider: FC<{
  category: CategoryDto;
  index: number;
  onLeft: () => void;
  onSelect: (media: MediaDto) => void;
}> = ({ category, index, onLeft, onSelect }) => {
  const dispatch = useAppDispatch();
  const page = useAppSelector(state => state.app.currentPage);
  const { data, updateSelected, mediaCount } = useSpecialCategories(category.id);
  const moviesProgress = useAppSelector(state => state.resume.movieProgress);
  const { margin } = useMediaBoxSizes();
  const lastHovered = useAppSelector(state => state.home.selectedByCategory[category.id] || 0);

  const sliderData = useMemo(
    () =>
      data.map(media =>
        media
          ? {
              backdrop: scaleImage(media.images.backdrop || media.images.backdrops[0]),
              id: media.ids.slug,
              logo: media.images.backdrop ? undefined : media.images.logos[0],
              progress: moviesProgress[media.id] || 0,
            }
          : null
      ),
    [data, moviesProgress]
  );

  const onHover = useCallback(
    (index: number) => {
      if (data[index]) {
        dispatch(setSelectedMedia(data[index]));
        dispatch(setSelectedIndexForCategory({ category: category.id, index }));
      }
    },
    [category.id, data, dispatch]
  );

  const onMediaSelect = useCallback(
    (index: number) => {
      if (data[index]) {
        onSelect(data[index]);
      }
    },
    [data, onSelect]
  );

  return (
    <CategorySliderContainer margin={margin} index={index}>
      <CategoryTitle>{category.name}</CategoryTitle>
      <Slider
        data={sliderData}
        enabled={page === 'home/categories'}
        lastHovered={lastHovered}
        onFirstVisibleChange={updateSelected}
        onHover={onHover}
        onLeft={onLeft}
        onMediaSelect={onMediaSelect}
        totalData={mediaCount}
        sliderKey={HOME_PREFIX + category.id}
      />
    </CategorySliderContainer>
  );
};
