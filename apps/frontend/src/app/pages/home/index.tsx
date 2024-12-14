import React, { useCallback, useEffect, useState } from 'react';
import { MediaDetails } from './components/mediaDetails';
import { MediaDto } from '@miauflix/types';
import { Categories } from './components/categories';
import {
  setFocus,
  updateAllLayouts,
} from '@noriginmedia/norigin-spatial-navigation';
import { SIDEBAR_FOCUS_KEY } from './consts';
import { FullScreenDiv } from '../../components/fullScreenDiv';
import { useAppDispatch, useAppSelector } from '../../../store/store';
import { HomeSidebar } from './components/sidebar';
import { PageProvider } from '../../contexts/page.context';
import { navigateTo } from '../../../store/slices/app';

export const Home = () => {
  const dispatch = useAppDispatch();
  const [showCategories, setShowCategories] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaDto | null>(null);
  const currentPage = useAppSelector((state) => state.app.currentPage);

  const openSidebar = useCallback(() => {
    setFocus(SIDEBAR_FOCUS_KEY);
  }, []);

  useEffect(() => {
    updateAllLayouts();
  }, [currentPage]);

  const navigateToMedia = useCallback(
    (media: MediaDto) => {
      setSelectedMedia(media);
      dispatch(navigateTo('home/details'));
      // Wait for previous animation to end before starting the next one
      setTimeout(() => {
        setShowCategories(false);
      }, 300);
    },
    [dispatch]
  );

  const navigateToCategoryList = useCallback(() => {
    setShowCategories(true);
    dispatch(navigateTo('home/categories'));

    setTimeout(() => {
      setSelectedMedia(null);
    }, 300);
  }, [dispatch]);

  return (
    <>
      <FullScreenDiv
        key="home"
        initial={{ opacity: 0 }}
        animate={{ opacity: currentPage === 'player' ? 0 : 1 }}
        exit={{ opacity: 0 }}
      >
        <PageProvider value={'home/details'}>
          <MediaDetails
            expanded={!!selectedMedia}
            expandedVisible={!showCategories}
            onNavigateBack={navigateToCategoryList}
          />
        </PageProvider>
        <PageProvider value={'home/categories'}>
          <Categories
            onLeft={openSidebar}
            onMediaSelect={navigateToMedia}
            visible={!selectedMedia}
          />
        </PageProvider>
      </FullScreenDiv>
      {currentPage.startsWith('home') && <HomeSidebar />}
    </>
  );
};
