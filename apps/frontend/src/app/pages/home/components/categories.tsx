import React, { FC, useCallback, useEffect, useMemo, useRef } from 'react';
import { useGetCategoriesQuery } from '../../../../store/api/categories';
import { gsap } from 'gsap';
import {
  FocusContext,
  getCurrentFocusKey,
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import {
  CATEGORIES_FOCUS_KEY,
  CONTINUE_WATCHING_CATEGORY,
  HOME_PREFIX,
  SLIDER_PREFIX,
} from '../consts';
import { CategoriesContainer, CategoriesWrapper } from './categoriesContainer';
import { CategorySlider, SLIDER_MARGIN } from './categorySlider';
import { CategoryDto, MediaDto } from '@miauflix/types';
import {
  useGetEpisodesProgressQuery,
  useGetMoviesProgressQuery,
} from '../../../../store/api/progress';
import { useAppSelector } from '../../../../store/store';
import { MEDIA_BOX_HEIGHT } from './mediaBox';
import { debounce } from '../../../utils/debounce';
import { useNavigation } from '../../../hooks/useNavigation';
import { IS_TV } from '../../../../consts';

const HOME_SLIDER_PREFIX = SLIDER_PREFIX + HOME_PREFIX;

interface CategoriesProps {
  onLeft: () => void;
  onMediaSelect: (media: MediaDto) => void;
  visible: boolean;
}

const useCategories = () => {
  const userId = useAppSelector((state) => state.app.currentUserId);
  const {
    data: moviesProgressCategory,
    isLoading: isMoviesProgressCategoryLoading,
  } = useGetMoviesProgressQuery(userId, {
    pollingInterval: 30000,
  });
  const {
    data: showsProgressCategory,
    isLoading: isShowsProgressCategoryLoading,
  } = useGetEpisodesProgressQuery(userId, {
    pollingInterval: 30000,
  });
  const { data: normalCategories, isLoading: areNormalCategoriesLoading } =
    useGetCategoriesQuery();

  return useMemo<CategoryDto[]>(() => {
    const categories: CategoryDto[] = [];
    if (
      isMoviesProgressCategoryLoading ||
      isShowsProgressCategoryLoading ||
      areNormalCategoriesLoading
    ) {
      return [];
    }
    if (
      moviesProgressCategory &&
      showsProgressCategory &&
      moviesProgressCategory.length + showsProgressCategory.length > 0
    ) {
      categories.push({
        id: CONTINUE_WATCHING_CATEGORY,
        name: 'Continue Watching',
      });
    }
    return [...categories, ...(normalCategories ?? [])];
  }, [
    areNormalCategoriesLoading,
    isMoviesProgressCategoryLoading,
    isShowsProgressCategoryLoading,
    moviesProgressCategory,
    normalCategories,
    showsProgressCategory,
  ]);
};

export const Categories: FC<CategoriesProps> = ({
  onLeft,
  onMediaSelect,
  visible,
}) => {
  const categories = useCategories();

  const { focusKey, ref, focusSelf } = useFocusable({
    saveLastFocusedChild: true,
    focusKey: CATEGORIES_FOCUS_KEY,
  });
  const categoriesWrapperRef = useRef<HTMLDivElement | null>(null);

  const focusCategory = useCallback(
    (index: number) => {
      if (ref.current) {
        const boundedIndex = Math.max(
          0,
          Math.min(index, categories.length - 1)
        );
        const top =
          boundedIndex === 0
            ? 0
            : (boundedIndex * (MEDIA_BOX_HEIGHT + SLIDER_MARGIN) + 5) *
              (window.innerHeight / 100);
        gsap.fromTo(
          ref.current,
          { scrollTop: ref.current.scrollTop },
          { scrollTop: top, duration: 0.2 }
        );
        setFocus(`${HOME_SLIDER_PREFIX}${categories[boundedIndex].id}`);
      }
    },
    [categories, ref]
  );

  const onArrow = useCallback(
    (direction: 'up' | 'down') => {
      const currentFocusKey = getCurrentFocusKey();
      const isFocusedOnCategory =
        currentFocusKey && currentFocusKey.startsWith(HOME_SLIDER_PREFIX);
      console.log('isFocusedOnCategory', isFocusedOnCategory, currentFocusKey);
      if (isFocusedOnCategory) {
        const focusedCategoryId = currentFocusKey.substring(
          HOME_SLIDER_PREFIX.length
        );
        const categoryIndex = categories.findIndex(
          (category) => category.id === focusedCategoryId
        );
        if (categoryIndex !== -1) {
          const nextCategoryIndex =
            direction === 'down' ? categoryIndex + 1 : categoryIndex - 1;
          if (nextCategoryIndex >= 0 && nextCategoryIndex < categories.length) {
            focusCategory(nextCategoryIndex);
          }
        }
        return true;
      }
      return false;
    },
    [categories, focusCategory]
  );

  useNavigation({
    page: 'home',
    onArrow,
  });

  const magneticScroll = debounce(
    useCallback(
      (top: number) => {
        const focusedCategory = Math.round(
          top / (window.innerHeight / 100) / (MEDIA_BOX_HEIGHT + SLIDER_MARGIN)
        );
        focusCategory(focusedCategory);
      },
      [focusCategory]
    ),
    50
  );

  const handleCategoriesScroll = useCallback(
    (ev: React.UIEvent<HTMLDivElement>) => {
      magneticScroll(ev.currentTarget.scrollTop);
    },
    [magneticScroll]
  );

  useEffect(() => {
    if (visible) {
      focusSelf();
    }
  }, [focusSelf, visible]);

  useEffect(() => {
    if (categories.length) {
      const firstCategory = categories[0];
      if (
        !(
          getCurrentFocusKey() &&
          getCurrentFocusKey().startsWith(HOME_SLIDER_PREFIX)
        )
      ) {
        setFocus(`${HOME_SLIDER_PREFIX}${firstCategory.id}`);
      }
    }
  }, [categories]);

  return (
    <FocusContext.Provider value={focusKey}>
      <CategoriesContainer
        visible={visible}
        ref={ref}
        onScroll={IS_TV ? undefined : handleCategoriesScroll}
      >
        <CategoriesWrapper
          categoriesCount={categories.length}
          ref={categoriesWrapperRef}
        >
          {categories.map((category, index) => (
            <CategorySlider
              key={category.id}
              category={category}
              index={index}
              onLeft={onLeft}
              onSelect={onMediaSelect}
              visible={visible}
            />
          ))}
        </CategoriesWrapper>
      </CategoriesContainer>
    </FocusContext.Provider>
  );
};
