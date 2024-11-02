import { MouseEventHandler, useCallback, useEffect, useState } from 'react';
import { useMediaBoxSizes } from './useMediaBoxSizes';
import {
  ArrowPressHandler,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { useSwipe } from '../../../hooks/useSwipe';
import { IS_TV } from '../../../../consts';
import { SLIDER_PREFIX } from '../consts';
import { useAppDispatch, useAppSelector } from '../../../../store/store';
import { setSelectedIndexForCategory } from '../../../../store/slices/home';

interface UseCategoryNavigationArgs {
  categoryId: string;
  mediaCount: number;
  onMediaSelect: (index: number) => void;
}

const noop = () => undefined;

export const useCategoryNavigation = ({
  categoryId,
  mediaCount,
  onMediaSelect,
}: UseCategoryNavigationArgs) => {
  const selectedFromStore = useAppSelector(
    (state) => state.home.selectedByCategory[categoryId]
  );
  const dispatch = useAppDispatch();
  const [selected, setSelected] = useState(selectedFromStore ?? 0);
  const [hovered, setHovered] = useState(selectedFromStore ?? 0);
  const [lastKeyboardMovement, setLastKeyboardMovement] = useState(0);
  const { mediaPerPage } = useMediaBoxSizes();
  const recentKeyPress = Date.now() - lastKeyboardMovement < 500;

  const move = useCallback(
    (direction: 'left' | 'right') => {
      const next = direction === 'left' ? selected - 1 : selected + 1;
      if (next < 0 || next >= mediaCount) {
        return true;
      }
      setSelected(next);
      return false;
    },
    [mediaCount, selected]
  );

  const onArrowPress: ArrowPressHandler = useCallback(
    (direction: string, props, details) => {
      if (direction === 'left' || direction === 'right') {
        return move(direction);
      }
      return true;
    },
    [move]
  );

  const onEnterPress = useCallback(() => {
    onMediaSelect(hovered);
  }, [hovered, onMediaSelect]);

  const { focused, ref } = useFocusable({
    focusKey: `${SLIDER_PREFIX}${categoryId}`,
    onArrowPress,
    onEnterPress,
  });

  useEffect(() => {
    dispatch(
      setSelectedIndexForCategory({ category: categoryId, index: hovered })
    );
  }, [categoryId, dispatch, hovered]);

  useEffect(() => {
    setHovered(selected);
    setLastKeyboardMovement(Date.now());
  }, [selected]);

  let handleHover: (index: number) => undefined | MouseEventHandler = noop;

  if (!IS_TV) {
    // Theoretically you should not have any react hooks inside a condition
    // but in this case the condition never changes during runtime so it's safe
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const handleSwipe = useCallback(
      (direction: 'left' | 'right') => {
        if (focused) {
          setSelected((selected) => {
            const next =
              direction === 'left'
                ? selected - mediaPerPage
                : selected + mediaPerPage;
            if (next < 0) {
              return 0;
            }
            if (next >= mediaCount - mediaPerPage) {
              return mediaCount - mediaPerPage;
            }
            return next;
          });
        }
      },
      [mediaCount, focused, mediaPerPage]
    );

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSwipe({
      directions: 'horizontal',
      onSwipe: handleSwipe,
    });

    // eslint-disable-next-line react-hooks/rules-of-hooks
    handleHover = useCallback(
      (index: number) => () => {
        if (index >= selected && index < selected + mediaPerPage) {
          if (Date.now() - lastKeyboardMovement > 500) {
            setHovered(index);
          }
        }
      },
      [lastKeyboardMovement, mediaPerPage, selected]
    );
  }

  return {
    selected,
    handleHover,
    ref,
    focused,
    hovered: IS_TV || recentKeyPress ? selected : hovered,
  };
};
