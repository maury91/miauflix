import { useGetListsQuery } from '@features/media/api/lists.api';
import type { MediaDto } from '@miauflix/backend';
import { Spinner } from '@shared/components';
import { PALETTE } from '@shared/config/constants';
import { type FC, useCallback, useRef, useState } from 'react';
import styled from 'styled-components';

import { CategoryRow, type CategoryRowHandle } from './components/CategoryRow';
import { MediaHero } from './components/MediaHero';
import { useMediaBoxSizes } from './hooks/useMediaBoxSizes';

const PageContainer = styled.main`
  position: absolute;
  inset: 0;
  overflow: auto hidden;
  background: #000;
  padding-top: 80px;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;
const Content = styled.div<{ $margin: number }>`
  padding: 0 ${({ $margin }) => $margin}px 60px;
`;
const FullPageState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: ${PALETTE.background.disabled};
`;

const HomePage: FC = () => {
  const { data: categories, isLoading, isError } = useGetListsQuery();
  const { mediaWidth, mediaPerPage, gap, margin } = useMediaBoxSizes();
  const [activeCategory, setActiveCategory] = useState(0);
  const [selectedMedia, setSelectedMedia] = useState<MediaDto | null>(null);
  const rowRefs = useRef(new Map<number, CategoryRowHandle>());
  const handleActive = useCallback(
    (categoryIndex: number, _mediaIndex: number, media: MediaDto) => {
      setActiveCategory(categoryIndex);
      setSelectedMedia(media);
    },
    []
  );
  const handleMoveCategory = useCallback(
    (categoryIndex: number, mediaIndex: number) => {
      if (!categories || categoryIndex < 0 || categoryIndex >= categories.length) return;
      rowRefs.current.get(categoryIndex)?.focusIndex(mediaIndex);
    },
    [categories]
  );

  if (isLoading)
    return (
      <PageContainer>
        <FullPageState>
          <Spinner text="Loading categories..." size={32} />
        </FullPageState>
      </PageContainer>
    );
  if (isError || !categories)
    return (
      <PageContainer>
        <FullPageState>Failed to load categories.</FullPageState>
      </PageContainer>
    );
  return (
    <PageContainer>
      <MediaHero media={selectedMedia} />
      <Content $margin={margin}>
        {categories.map((category, index) => (
          <CategoryRow
            key={category.slug}
            ref={handle => {
              if (handle) rowRefs.current.set(index, handle);
              else rowRefs.current.delete(index);
            }}
            category={category}
            categoryIndex={index}
            mediaWidth={mediaWidth}
            mediaPerPage={mediaPerPage}
            gap={gap}
            active={activeCategory === index}
            onActive={handleActive}
            onMoveCategory={handleMoveCategory}
          />
        ))}
      </Content>
    </PageContainer>
  );
};
export default HomePage;
