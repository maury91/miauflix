import { motion } from 'framer-motion';
import styled from 'styled-components';
import React, { FC, useCallback, useEffect, useState } from 'react';
import { MediaDetails } from './components/mediaDetails';
import { MediaDto } from '@miauflix/types';
import { Categories } from './components/categories';
import { useGetExtendedInfoQuery } from '../../../store/api/medias';
import { skipToken } from '@reduxjs/toolkit/query';
import { useBackNavigation } from '../../hooks/useBackNavigation';
import { MediaPage } from './components/mediaPage';
import MdiSearch from '~icons/mdi/search';
import {
  FocusContext,
  getCurrentFocusKey,
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { CATEGORIES_FOCUS_KEY } from './consts';

export const HomeContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
`;

const HomeSidebarContainer = styled.div<{ opened: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  width: ${({ opened }) => (opened ? 15 : 5)}vw;
  transition: width 0.3s;
  bottom: 0;
  z-index: 101;

  &:before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    background: rgba(0, 0, 0, 0.7);
  }

  &:after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    right: -1vw;
    width: 1vw;
    background: linear-gradient(
      90deg,
      rgba(0, 0, 0, 0.7) 0%,
      rgba(0, 0, 0, 0) 100%
    );
  }
`;

const SearchContainer = styled.div`
  position: absolute;
  font-size: 2vw;
  width: 2vw;
  height: 2vw;
  top: calc(50% - 1vw);
  left: 1vw;
`;

const Search: FC<{ opened: boolean }> = ({ opened }) => {
  const { ref } = useFocusable({
    focusKey: 'sidebar-search',
  });
  return (
    <SearchContainer ref={ref}>
      <MdiSearch />
    </SearchContainer>
  );
};

const HomeSidebar = () => {
  const { focusKey, ref, focused, hasFocusedChild } = useFocusable({
    saveLastFocusedChild: true,
    trackChildren: true,
    focusKey: 'home-sidebar',
  });
  const expand = focused || getCurrentFocusKey() === 'sidebar-search';

  useEffect(() => {
    if (expand) {
      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'ArrowRight') {
          setFocus(CATEGORIES_FOCUS_KEY);
          event.stopPropagation();
          event.preventDefault();
        }
      }
      document.body.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.removeEventListener('keydown', handleKeyDown);
      };
    }
    return;
  }, [expand]);

  console.log({ focused, hasFocusedChild });
  return (
    <FocusContext.Provider value={focusKey}>
      <HomeSidebarContainer ref={ref} opened={expand}>
        <Search opened={expand} />
      </HomeSidebarContainer>
    </FocusContext.Provider>
  );
};

export const Home = () => {
  const [showCategories, setShowCategories] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaDto | null>(null);
  const { data: extendedMedia } = useGetExtendedInfoQuery(
    selectedMedia ? { type: 'movie', id: selectedMedia.id } : skipToken
  );

  const navigateToMedia = useCallback((media: MediaDto) => {
    setSelectedMedia(media);
    // Wait for previous animation to end before starting the next one
    setTimeout(() => {
      setShowCategories(false);
    }, 300);
  }, []);

  const navigateToCategoryList = useCallback(() => {
    setShowCategories(true);
    setTimeout(() => {
      setSelectedMedia(null);
    }, 300);
  }, []);
  useBackNavigation('home', navigateToCategoryList);

  return (
    <>
      <MediaDetails expanded={!!selectedMedia} />
      <Categories visible={!selectedMedia} onMediaSelect={navigateToMedia} />
      {selectedMedia && extendedMedia && (
        <MediaPage media={extendedMedia} visible={!showCategories} />
      )}
      <HomeSidebar />
    </>
  );
};
