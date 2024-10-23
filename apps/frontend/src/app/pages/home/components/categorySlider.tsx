import { FC, useMemo, useState } from 'react';
import { useGetListQuery } from '../../../../store/api/lists';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { motion, MotionConfig } from 'framer-motion';
import styled from 'styled-components';
import { scaleImage } from '../utils/scaleImage';
import { useWindowSize } from '../../../hooks/useWindowSize';
import { CategoryDto } from '@miauflix/types';

const CategorySliderContainer = styled.div<{
  marginLeft: number;
  width: number;
}>`
  position: absolute;
  left: ${(props) => props.marginLeft}px;
  width: ${(props) => props.width}px;
  height: 20vh;
`;

const CategoryTitle = styled.h2`
  margin-bottom: 5vh;
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
  const [selected, setSelected] = useState(0);
  const { width, height } = useWindowSize();
  const {
    mediaWidth,
    mediaPerPage,
    mediaGap,
    mediaLeftMargin,
    totalMediaWidth,
  } = useMemo(() => {
    const mediaWidth = 0.352 * height;
    const mediaGap = 0.02 * height;
    const mediaPerPage = Math.floor(width / mediaWidth);
    const totalMediaWidth =
      mediaWidth * mediaPerPage + mediaGap * (mediaPerPage - 1);
    const mediaLeftMargin = (width - totalMediaWidth) / 2;
    return {
      mediaWidth,
      mediaPerPage,
      mediaGap,
      mediaLeftMargin,
      totalMediaWidth,
    };
  }, [width, height]);

  const { ref, focused } = useFocusable({
    focusKey: `slider-${category.id}`,
    onArrowPress: (direction) => {
      if (direction === 'left') {
        if (selected < 1) {
          return true;
        }
        setSelected(selected - 1);
        // move('left');
        return false;
      }
      if (direction === 'right') {
        if (selected >= (data?.length ?? 0) - 1) {
          return true;
        }
        // move('right');
        setSelected(selected + 1);
        return false;
      }
      return true;
    },
  });

  return (
    <CategorySliderContainer
      marginLeft={mediaLeftMargin}
      width={totalMediaWidth}
      ref={ref}
    >
      <CategoryTitle>{category.name}</CategoryTitle>
      <CategoryContent>
        {focused && <MediaHighlight />}
        <MotionConfig transition={{ duration: 0.4 }}>
          <motion.div animate={{ x: -(mediaWidth + mediaGap) * selected }}>
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
