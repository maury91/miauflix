import type { RealtimeMediaRef } from '@features/realtime/realtime.client';

import type { HomeView } from './homeNavigation';

export interface HomeInterestWindow {
  media: Array<RealtimeMediaRef | null>;
  center: number | null;
  visible: number[];
}

export interface HomeRealtimeInterest {
  focus: { view: HomeView; media: RealtimeMediaRef | null };
  map: {
    center: [number, number] | null;
    mediaIds: Array<Array<RealtimeMediaRef | null>>;
    visible: Array<[number, number]>;
  };
}

/** Derive the existing bounded navigation matrix from the visible row observations. */
export function buildHomeRealtimeInterest(input: {
  activeCategory: number;
  rowCount: number;
  rowWindows: Array<HomeInterestWindow | undefined>;
  selectedMedia: RealtimeMediaRef | null;
  view: HomeView;
}): HomeRealtimeInterest | null {
  const { activeCategory, rowCount, rowWindows, selectedMedia, view } = input;
  if (!rowCount) return null;

  const rowStart = Math.max(0, Math.min(activeCategory - 5, rowCount - 11));
  const rows: Array<Array<RealtimeMediaRef | null>> = [];
  const visible: Array<[number, number]> = [];
  let center: [number, number] | null = null;

  for (let rowIndex = rowStart; rowIndex < Math.min(rowCount, rowStart + 11); rowIndex += 1) {
    const window = rowWindows[rowIndex];
    const media = window?.media ?? [];
    rows.push(media);
    if (
      window?.center !== null &&
      window?.center !== undefined &&
      rowIndex >= activeCategory &&
      rowIndex <= activeCategory + 1
    ) {
      for (const column of window.visible) {
        if (media[column]) visible.push([rowIndex - rowStart, column]);
      }
    }
    if (rowIndex === activeCategory && window?.center !== null && window?.center !== undefined) {
      center = [rowIndex - rowStart, window.center];
    }
  }

  return {
    focus: { view, media: view === 'player' ? null : selectedMedia },
    map: {
      center: view === 'browse' ? center : null,
      mediaIds: view === 'browse' ? rows : [],
      visible: view === 'browse' ? visible : [],
    },
  };
}
