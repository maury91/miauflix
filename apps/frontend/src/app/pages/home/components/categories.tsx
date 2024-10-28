import { FC, useCallback, useEffect, useRef } from 'react';
import { useGetCategoriesQuery } from '../../../../store/api/categories';
import { gsap } from 'gsap';
import {
  FocusContext,
  getCurrentFocusKey,
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { SLIDER_PREFIX } from '../consts';
import { useSwipe } from '../../../hooks/useSwipe';
import { CategoriesContainer } from './categoriesContainer';
import { CategorySlider } from './categorySlider';
import { IS_SLOW_DEVICE } from '../../../../consts';
import { MovieDto } from '@miauflix/types';

const OFFSET = IS_SLOW_DEVICE ? 0 : 5;

interface CategoriesProps {
  onMediaSelect: (media: MovieDto) => void;
  visible: boolean;
}

export const Categories: FC<CategoriesProps> = ({ onMediaSelect, visible }) => {
  const { data: categories } = useGetCategoriesQuery();
  const { focusKey, ref, focusSelf } = useFocusable({
    saveLastFocusedChild: true,
  });
  const categoriesWrapperRef = useRef<HTMLDivElement | null>(null);
  const scrollAnimationRef = useRef<gsap.QuickToFunc | null>(null);
  const setFocusedSlider = useCallback(
    (direction: 'up' | 'down') => {
      if (categories) {
        const currentFocusKey = getCurrentFocusKey();
        const currentFocusedSlider =
          currentFocusKey && currentFocusKey.startsWith(SLIDER_PREFIX)
            ? currentFocusKey.substring(SLIDER_PREFIX.length)
            : '';
        const currentFocusedIndex = categories.findIndex(
          (category) => category.id === currentFocusedSlider
        );
        if (currentFocusedIndex !== -1) {
          const nextIndex =
            direction === 'up'
              ? currentFocusedIndex - 1
              : currentFocusedIndex + 1;
          if (nextIndex >= 0 && nextIndex < categories.length) {
            setFocus(`${SLIDER_PREFIX}${categories[nextIndex].id}`);
          }
        } else {
          setFocus(`${SLIDER_PREFIX}${categories[0].id}`);
        }
      }
    },
    [categories]
  );

  useEffect(() => {
    if (visible) {
      focusSelf();
    }
  }, [focusSelf, visible]);

  useEffect(() => {
    if (categories) {
      const firstCategory = categories[0];
      if (
        !(
          getCurrentFocusKey() && getCurrentFocusKey().startsWith(SLIDER_PREFIX)
        )
      ) {
        setFocus(`${SLIDER_PREFIX}${firstCategory.id}`);
      }
    }
  }, [categories]);

  useSwipe({ directions: 'vertical', onSwipe: setFocusedSlider });

  const scrollTo = useCallback((to: number) => {
    if (!scrollAnimationRef.current) {
      scrollAnimationRef.current = gsap.quickTo(
        categoriesWrapperRef.current,
        'y',
        {
          duration: 0.3,
        }
      );
    }
    scrollAnimationRef.current?.(((-to + OFFSET) / 100) * window.innerHeight);
  }, []);

  if (!categories) {
    return null;
  }

  return (
    <FocusContext.Provider value={focusKey}>
      <CategoriesContainer visible={visible} ref={ref}>
        <div ref={categoriesWrapperRef}>
          {visible &&
            categories.map((category, index) => (
              <CategorySlider
                key={category.id}
                category={category}
                index={index}
                scrollTo={scrollTo}
                onSelect={onMediaSelect}
              />
            ))}
        </div>
      </CategoriesContainer>
    </FocusContext.Provider>
  );
};
