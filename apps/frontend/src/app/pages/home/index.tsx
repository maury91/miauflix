import { motion } from 'framer-motion';
import styled from 'styled-components';
import React, { FC, useCallback, useEffect, useState } from 'react';
import { MediaDetails } from './components/mediaDetails';
import { MediaDto } from '@miauflix/types';
import { Categories } from './components/categories';
import { useGetExtendedInfoQuery } from '../../../store/api/medias';
import { skipToken } from '@reduxjs/toolkit/query';
import { useNavigation } from '../../hooks/useNavigation';
import { MediaPage } from './components/mediaPage';
import MdiSearch from '~icons/mdi/search';
import {
  FocusContext,
  getCurrentFocusKey,
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { CATEGORIES_FOCUS_KEY, SIDEBAR_FOCUS_KEY } from './consts';
import { PALETTE } from '../../../consts';
import { FullScreenDiv } from '../../components/fullScreenDiv';
import { useAppSelector } from '../../../store/store';

const HomeSidebarContainer = styled.div<{ opened: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  width: ${({ opened }) => (opened ? 15 : 5)}vw;
  transition: width 0.3s;
  bottom: 0;
  z-index: 101;
  background: rgba(0, 0, 0, 0.7);

  &:before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 100%;
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

const SearchContainer = styled.div<{ focused: boolean }>`
  position: absolute;
  font-size: 1.8vw;
  width: 15vw;
  height: 2vw;
  top: calc(50% - 1vw);
  left: 1vw;
  display: flex;
  align-items: center;
  color: ${({ focused }) => (focused ? PALETTE.background.primary : 'white')};

  svg {
    margin-right: 1vw;
    font-size: 2vw;
  }
`;

const Search: FC<{ opened: boolean }> = ({ opened }) => {
  const { ref, focused } = useFocusable({
    focusKey: 'sidebar-search',
  });
  return (
    <SearchContainer ref={ref} focused={focused}>
      <MdiSearch /> {opened && 'Search'}
    </SearchContainer>
  );
};

const HomeSidebar = () => {
  const { focusKey, ref, focused, hasFocusedChild, focusSelf } = useFocusable({
    saveLastFocusedChild: true,
    trackChildren: true,
    focusKey: SIDEBAR_FOCUS_KEY,
  });
  const expand = focused || getCurrentFocusKey() === 'sidebar-search';

  const focusCategories = useCallback(() => {
    setFocus(CATEGORIES_FOCUS_KEY);
  }, []);

  useEffect(() => {
    if (expand) {
      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'ArrowRight') {
          focusCategories();
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

  return (
    <FocusContext.Provider value={focusKey}>
      <HomeSidebarContainer
        ref={ref}
        opened={expand}
        onMouseEnter={focusSelf}
        onMouseLeave={focusCategories}
      >
        <Search opened={expand} />
      </HomeSidebarContainer>
    </FocusContext.Provider>
  );
};

export const Home = () => {
  const [showCategories, setShowCategories] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaDto | null>(null);
  const { data: extendedMedia } = useGetExtendedInfoQuery(
    selectedMedia
      ? { type: selectedMedia.type, id: selectedMedia.id }
      : skipToken
  );
  const currentPage = useAppSelector((state) => state.app.currentPage);

  const openSidebar = useCallback(() => {
    setFocus(SIDEBAR_FOCUS_KEY);
  }, []);

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
  useNavigation({ page: 'home', onBack: navigateToCategoryList });

  return (
    <FullScreenDiv
      key="home"
      initial={{ opacity: 0 }}
      animate={{ opacity: currentPage === 'player' ? 0 : 1 }}
      exit={{ opacity: 0 }}
    >
      <MediaDetails expanded={!!selectedMedia} />
      <Categories
        visible={!selectedMedia}
        onLeft={openSidebar}
        onMediaSelect={navigateToMedia}
      />
      {selectedMedia && extendedMedia && (
        <MediaPage media={extendedMedia} visible={!showCategories} />
      )}
      <HomeSidebar />
    </FullScreenDiv>
  );
};
