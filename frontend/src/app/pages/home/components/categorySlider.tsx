import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useGetListQuery } from '@store/api/lists';
import { Slider } from '@components/slider';
import { useAppDispatch, useAppSelector } from '@store/store';
import { setSelectedIndexForCategory, setSelectedMedia } from '@store/slices/home';
import { scaleImage } from '../utils/scaleImage';
import { ListDto, MediaDto } from '@miauflix/backend-client';
import { useMediaBoxSizes } from '../hooks/useMediaBoxSizes';
import { MEDIA_BOX_HEIGHT } from './mediaBox';
import { skipToken } from '@reduxjs/toolkit/query';
import { HOME_PREFIX } from '../consts';
import { CATEGORY_CONTAINER_TOP_MASK } from './categoriesContainer';

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
  // FixMe: Remove hardcoded 20 items per page
  const pagesCount = currentList.data?.total ? Math.ceil(currentList.data.total / 20) : 0; // Assuming 20 items per page
  const pageSize = 20;

  useEffect(() => {
    setTotalPages(pagesCount);
  }, [pagesCount]);

  const data = useMemo(() => {
    const combinedData: (MediaDto | null)[] = new Array(Math.max(pageSize * (page - 1), 0)).fill(
      null
    );
    for (const listData of [
      page === 0 ? { results: [] } : previousList.data,
      currentList.data,
      nextList.data,
    ]) {
      if (listData) {
        combinedData.push(...listData.results);
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

// const SPECIAL_CATEGORIES = [CONTINUE_WATCHING_CATEGORY];

// const useSpecialList = (category: string): ListHookReturn => {
//   const userId = useAppSelector(state => state.app.currentUserId);
//   // FixMe: The get progress query should return a list of media items not a single item
//   const { data: progressCategory } = useGetProgressQuery(
//     category === CONTINUE_WATCHING_CATEGORY ? { type: 'show', id: userId } : skipToken
//   );

//   if (progressCategory) {
//     const data = progressCategory
//       .map((media: any) => media.show)
//       .filter(
//         (media: any, index: number, arr: any[]) =>
//           arr.findIndex(({ id }: any) => id === media.id) === index
//       )
//       .sort((a: any, b: any) => (a.title > b.title ? 1 : -1));
//     return {
//       data,
//       updateSelected: () => {
//         // nothing
//       },
//       mediaCount: data.length,
//     };
//   }

//   return {
//     data: [],
//     updateSelected: () => {
//       // nothing
//     },
//     mediaCount: 0,
//   };
// };

// const useSpecialCategories = (category: string) => {
//   const skipNormalCategory = SPECIAL_CATEGORIES.includes(category);
//   const normalListResult = useInfiniteList(category, skipNormalCategory);
//   const specialListResult = useSpecialList(CONTINUE_WATCHING_CATEGORY);

//   if (SPECIAL_CATEGORIES.includes(category)) {
//     return specialListResult;
//   }
//   return normalListResult;
// };

export const CategorySlider: FC<{
  category: ListDto;
  index: number;
  onLeft: () => void;
  onSelect: (media: MediaDto) => void;
}> = ({ category, index, onLeft, onSelect }) => {
  const dispatch = useAppDispatch();
  const page = useAppSelector(state => state.app.currentPage);
  const { data, updateSelected, mediaCount } = useInfiniteList(category.slug);
  const moviesProgress = useAppSelector(state => state.resume.movieProgress);
  const { margin } = useMediaBoxSizes();
  const lastHovered = useAppSelector(state => state.home.selectedByCategory[category.slug] || 0);

  const sliderData = useMemo(
    () =>
      data.map(media =>
        media
          ? {
              backdrop: scaleImage(media.backdrop || ''),
              id: media._type === 'movie' ? String(media.id) : String(media.id),
              logo: media._type === 'movie' ? media.logo : undefined,
              progress: moviesProgress[media.id] || 0,
            }
          : null
      ),
    [data, moviesProgress]
  );

  const onHover = useCallback(
    (index: number) => {
      if (data[index]) {
        dispatch(setSelectedMedia(data[index] as any)); // TODO: Fix type conversion
        dispatch(setSelectedIndexForCategory({ category: category.slug, index }));
      }
    },
    [category.slug, data, dispatch]
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
        sliderKey={HOME_PREFIX + category.slug}
      />
    </CategorySliderContainer>
  );
};
