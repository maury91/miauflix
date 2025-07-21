import React, { useCallback, useState } from 'react';
import { ArrowPressHandler, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { IS_TV } from '@/consts';
import { SLIDER_PREFIX } from '../consts';
import { useMediaBoxSizes } from './useMediaBoxSizes';

interface UseCategoryNavigationArgs {
  key: string | number;
  enabled: boolean;
  lastHovered: number;
  onMediaSelect?: (index: number) => void;
  onLeft?: () => void;
  onHover: (index: number) => void;
  totalData: number;
  restrictUpAndDown: boolean;
}

const noop = () => undefined;

export const useCategoryNavigation = ({
  key,
  enabled,
  lastHovered,
  onLeft,
  onMediaSelect,
  onHover,
  totalData,
  restrictUpAndDown,
}: UseCategoryNavigationArgs) => {
  const [firstVisible, setFirstVisible] = useState(lastHovered);
  const [firstItemToDisplay, setFirstItemToDisplay] = useState(lastHovered);
  const [hovered, setHovered] = useState(lastHovered);
  const [lastKeyboardMovement, setLastKeyboardMovement] = useState(0);
  const [disableAutoScroll, setDisableAutoScroll] = useState(false);
  const { mediaWidth, gap, mediaPerPage } = useMediaBoxSizes();

  const move = useCallback(
    (direction: 'left' | 'right') => {
      const next = direction === 'left' ? hovered - 1 : hovered + 1;
      if (next < 0 || next >= totalData) {
        return true;
      }
      setHovered(next);
      onHover(next);
      setLastKeyboardMovement(Date.now());

      // In case of TV we want the highlight to be always on the first item
      if (IS_TV || next < firstVisible) {
        setFirstItemToDisplay(next);
        setFirstVisible(next);
      } else if (next >= firstVisible + mediaPerPage) {
        setFirstItemToDisplay(next - mediaPerPage + 1);
      }
      return false;
    },
    [hovered, totalData, onHover, firstVisible, mediaPerPage]
  );

  const onArrowPress: ArrowPressHandler = useCallback(
    (direction: string, props, details) => {
      if (!enabled) {
        return false;
      }
      if (direction === 'left' || direction === 'right') {
        const isEnd = move(direction);
        if (isEnd && direction === 'left') {
          onLeft?.();
          return false;
        }
        return isEnd;
      }
      // Disable focusable for up and down
      if (direction === 'up' || direction === 'down') {
        if (restrictUpAndDown) {
          return false;
        }
      }
      return true;
    },
    [enabled, move, onLeft, restrictUpAndDown]
  );

  const onEnterPress = useCallback(() => {
    onMediaSelect?.(hovered);
  }, [hovered, onMediaSelect]);

  const { focused, ref, focusSelf } = useFocusable({
    focusKey: `${SLIDER_PREFIX}${key}`,
    focusable: enabled,
    onArrowPress,
    onEnterPress,
  });

  /** Web only **/
  const handleScroll = IS_TV
    ? noop
    : // eslint-disable-next-line react-hooks/rules-of-hooks
      useCallback(
        (ev: React.UIEvent<HTMLDivElement>) => {
          const scrollLeft = ev.currentTarget.scrollLeft;
          const firstVisibleMediaBox = Math.round(scrollLeft / (mediaWidth + gap));
          setFirstVisible(firstVisibleMediaBox);
        },
        [gap, mediaWidth]
      );

  const handleHover = IS_TV
    ? noop
    : // eslint-disable-next-line react-hooks/rules-of-hooks
      useCallback(
        (index: number) => () => {
          if (Date.now() - lastKeyboardMovement > 500) {
            if (!focused) {
              setDisableAutoScroll(true);
              focusSelf();
              setTimeout(() => {
                setDisableAutoScroll(false);
              }, 20);
            }
            setHovered(index);
            onHover(index);
          }
        },
        [focusSelf, focused, lastKeyboardMovement, onHover]
      );
  /** end web only **/

  return {
    firstItemToDisplay,
    handleHover,
    ref,
    focused,
    hovered,
    handleScroll,
    firstVisible,
    disableAutoScroll,
  };
};
