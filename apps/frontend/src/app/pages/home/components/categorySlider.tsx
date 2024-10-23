import { FC, useEffect, useState } from 'react';
import { useGetListQuery } from '../../../../store/api/lists';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { motion, MotionConfig } from 'framer-motion';
import styled from 'styled-components';
import { scaleImage } from '../utils/scaleImage';
import { CategoryDto } from '@miauflix/types';
import { useAppDispatch } from '../../../../store/store';
import { setSelectedMedia } from '../../../../store/slices/home';
import { useMediaBoxSizes } from '../hooks/useMediaBoxSizes';

const CategorySliderContainer = styled.div<{
  margin: number;
}>`
  position: absolute;
  left: ${(props) => props.margin}px;
  right: ${(props) => props.margin}px;
  height: 20vh;
`;

const CategoryTitle = styled.h3`
  margin: 0 0 3vh;
`;

const CategoryContent = styled.div`
  position: relative;
`;

const MediaBox = styled.div<{ src: string; index: number }>`
  border-radius: 0.6vh;
  background: url(${(props) => props.src}) center no-repeat;
  background-size: cover;
  height: 20vh;
  width: 35.2vh;
  position: absolute;
  top: 0;
  left: ${(props) => props.index * 37.2}vh;
`;

const MediaHighlight = styled.div`
  position: absolute;
  top: -3px;
  left: -3px;
  width: 35.2vh;
  height: 20vh;
  border: 3px solid #d81f27;
  border-radius: 1vh;
  z-index: 2;
`;

export const CategorySlider: FC<{ category: CategoryDto }> = ({ category }) => {
  const { data } = useGetListQuery(category.id);
  const dispatch = useAppDispatch();
  const [selected, setSelected] = useState(0);
  const { mediaWidth, mediaPerPage, gap, margin } = useMediaBoxSizes();
  const move = (direction: 'left' | 'right') => {
    const next = direction === 'left' ? selected - 1 : selected + 1;
    if (next < 0 || next >= (data?.length ?? 0)) {
      return true;
    }
    setSelected(next);
    return false;
  };

  const { ref, focused } = useFocusable({
    focusKey: `slider-${category.id}`,
    onArrowPress: (direction) => {
      if (direction === 'left' || direction === 'right') {
        return move(direction);
      }
      return true;
    },
  });

  useEffect(() => {
    if (data) {
      dispatch(setSelectedMedia(data[selected]));
    }
  }, [data, selected]);

  return (
    <CategorySliderContainer margin={margin} ref={ref}>
      <CategoryTitle>{category.name}</CategoryTitle>
      <CategoryContent>
        {focused && <MediaHighlight />}
        <MotionConfig transition={{ duration: 0.3 }}>
          <motion.div animate={{ x: -(mediaWidth + gap) * selected }}>
            {data &&
              data.map((media, index) => {
                if (
                  index < selected - 4 ||
                  index > selected + 4 + mediaPerPage
                ) {
                  return null;
                }
                return (
                  <MediaBox
                    key={media.ids.slug}
                    src={scaleImage(media.images.backdrop)}
                    index={index}
                  />
                );
              })}
          </motion.div>
        </MotionConfig>
      </CategoryContent>
    </CategorySliderContainer>
  );
};
