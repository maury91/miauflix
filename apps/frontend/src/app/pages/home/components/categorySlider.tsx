import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { gsap } from 'gsap';
import { useGetListQuery } from '../../../../store/api/lists';
import styled from 'styled-components';
import { scaleImage } from '../utils/scaleImage';
import { CategoryDto, MediaDto } from '@miauflix/types';
import { useAppDispatch, useAppSelector } from '../../../../store/store';
import {
  changeCategory,
  setSelectedMedia,
} from '../../../../store/slices/home';
import { useMediaBoxSizes } from '../hooks/useMediaBoxSizes';
import {
  MEDIA_BOX_HEIGHT,
  MediaBox,
  MediaHighlight,
  OuterMediaHighlight,
  OuterMediaHighlightBackground,
} from './mediaBox';
import { useCategoryNavigation } from '../hooks/useCategoryNavigation';
import { IS_TV } from '../../../../consts';
import { skipToken } from '@reduxjs/toolkit/query';
import { CONTINUE_WATCHING_CATEGORY } from '../consts';
import { useGetProgressQuery } from '../../../../store/api/progress';
import { CATEGORY_CONTAINER_TOP_MASK } from './categoriesContainer';

export const SLIDER_MARGIN = 10;

const CategorySliderContainer = styled.div<{
  margin: number;
  index: number;
}>`
  position: absolute;
  left: ${(props) => props.margin}px;
  right: 0;
  top: ${(props) =>
    props.index * (MEDIA_BOX_HEIGHT + SLIDER_MARGIN) +
    CATEGORY_CONTAINER_TOP_MASK}vh;
  height: ${MEDIA_BOX_HEIGHT}vh;
`;

const CategoryTitle = styled.h3`
  height: 5vh;
  margin: 0 0 1vh;
`;

const CategoryContent = styled.div`
  position: relative;
  height: ${MEDIA_BOX_HEIGHT * 1.1}vh;
  overflow-x: scroll;
`;

const CategoryContentWrapper = styled.div<{ mediaCount: number }>`
  width: ${({ mediaCount }) => mediaCount * 37.2}vh;
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
    const combinedData: (MediaDto | null)[] = new Array(
      Math.max(pageSize * (page - 1), 0)
    ).fill(null);
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
  const userId = useAppSelector((state) => state.app.currentUserId);
  const { data: progressCategory } = useGetProgressQuery(
    category === CONTINUE_WATCHING_CATEGORY ? userId : skipToken
  );

  if (progressCategory) {
    return {
      data: progressCategory.map(({ movie }) => movie),
      updateSelected: () => {
        // nothing
      },
      mediaCount: progressCategory.length,
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
  const { data, updateSelected, mediaCount } = useSpecialCategories(
    category.id
  );
  const mediasProgress = useAppSelector((state) => state.resume.mediaProgress);
  const categoryContentRef = useRef<HTMLDivElement>(null);
  const mediaHighlightRef = useRef<HTMLDivElement>(null);
  const mediaHighlightAnimationRef = useRef<gsap.QuickToFunc | null>(null);
  const dispatch = useAppDispatch();
  const { mediaWidth, mediaPerPage, gap, margin } = useMediaBoxSizes();

  const onMediaSelect = useCallback(
    (index: number) => {
      if (data[index]) {
        onSelect(data[index]);
      }
    },
    [data, onSelect]
  );

  const onHover = useCallback(
    (index: number) => {
      if (data[index]) {
        dispatch(setSelectedMedia(data[index]));
      }
    },
    [data, dispatch]
  );

  const {
    firstItemToDisplay,
    handleHover,
    ref,
    focused,
    hovered,
    firstVisible,
    handleScroll,
    disableAutoScroll,
  } = useCategoryNavigation({
    categoryId: category.id,
    mediaCount,
    onLeft,
    onMediaSelect,
    onHover,
  });

  const highlightTranslateX = (mediaWidth + gap) * hovered;

  useEffect(() => {
    console.log(firstVisible);
    updateSelected(firstVisible);
  }, [firstVisible, updateSelected]);

  useEffect(() => {
    if (data[hovered] && focused) {
      dispatch(setSelectedMedia(data[hovered]));
    }
  }, [focused, data, hovered, dispatch]);

  useEffect(() => {
    if (focused) {
      mediaHighlightAnimationRef.current = gsap.quickTo(
        mediaHighlightRef.current,
        'x',
        {
          duration: 0.2,
          ease: 'none',
        }
      );
      mediaHighlightAnimationRef.current?.(highlightTranslateX);
    }
  }, [focused, highlightTranslateX]);

  useEffect(() => {
    gsap.fromTo(
      categoryContentRef.current,
      { scrollLeft: categoryContentRef.current?.scrollLeft },
      {
        scrollLeft: firstItemToDisplay * (mediaWidth + gap),
        duration: 0.2,
        ease: 'none',
      }
    );
  }, [gap, mediaWidth, firstItemToDisplay]);

  useEffect(() => {
    mediaHighlightAnimationRef.current?.(
      highlightTranslateX,
      disableAutoScroll ? highlightTranslateX : undefined
    );
  }, [disableAutoScroll, highlightTranslateX]);

  // ToDo: Add arrows to navigate through the media

  return (
    <CategorySliderContainer margin={margin} index={index} ref={ref}>
      <CategoryTitle>{category.name}</CategoryTitle>
      <CategoryContent onScroll={handleScroll} ref={categoryContentRef}>
        {focused && !IS_TV && <MediaHighlight ref={mediaHighlightRef} />}
        <CategoryContentWrapper mediaCount={data.length}>
          {data.map((media, index) => {
            if (
              !media ||
              index < firstVisible - 4 ||
              index > firstVisible + 4 + mediaPerPage
            ) {
              return null;
            }
            return (
              <MediaBox
                key={media.id}
                src={scaleImage(
                  media.images.backdrop || media.images.backdrops[0]
                )}
                logoSrc={
                  media.images.backdrop ? undefined : media.images.logos[0]
                }
                index={index}
                onMouseEnter={handleHover(index)}
                onClick={() => onMediaSelect(index)}
                progress={mediasProgress[media.id] ?? 0}
              />
            );
          })}
        </CategoryContentWrapper>
      </CategoryContent>
      {focused && IS_TV && (
        <>
          <OuterMediaHighlightBackground />
          <OuterMediaHighlight />
        </>
      )}
    </CategorySliderContainer>
  );
};
