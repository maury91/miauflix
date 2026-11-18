import { Heading, List, ListItem, useFlyoutBottom } from '@shared/design-system';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { FocusScope } from '@shared/navigation';
import type { FC, ReactNode } from 'react';

import * as styles from './settingsMenu.css';

import ConfigurationIcon from '~icons/mdi/cog-outline';
import StorageIcon from '~icons/mdi/harddisk';
import SourcesIcon from '~icons/mdi/layers-outline';
import ServerIcon from '~icons/mdi/server-network';

/** Marks the panel, so the rail can tell the pointer moved onto it rather than away. */
export const SETTINGS_PANEL_ATTRIBUTE = 'data-settings-panel';

/** The rail item the panel lines up with. */
export const SETTINGS_RAIL_ITEM_ATTRIBUTE = 'data-rail-settings';

export type SettingsArea = 'configuration' | 'storage' | 'sources' | 'server';

/** Navigation ids of the panel's scope and areas. */
const SETTINGS_MENU_NAV = {
  scope: 'settings-menu',
  area: (area: SettingsArea) => `settings-menu:${area}`,
} as const;

const AREAS: Record<SettingsArea, { title: string; icon: ReactNode }> = {
  configuration: { title: 'Configuration', icon: <ConfigurationIcon /> },
  storage: { title: 'Storage', icon: <StorageIcon /> },
  sources: { title: 'Sources', icon: <SourcesIcon /> },
  server: { title: 'Change server', icon: <ServerIcon /> },
};

const DESCRIPTIONS: Record<Exclude<SettingsArea, 'server'>, string> = {
  configuration: 'Services, integrations and server configuration',
  storage: 'Downloaded files and the space they use',
  sources: 'Source providers and the order they are searched in',
};

export interface SettingsMenuProps {
  /** The areas to offer, in order (administrator areas; Change server on TV). */
  areas: readonly SettingsArea[];
  /** The server's address, described under Change server. */
  serverAddress?: string;
  /**
   * The keyboard is in the panel (rather than on the rail): its areas become a contained
   * navigation scope, entered at the first.
   */
  focused: boolean;
  onOpen: (area: SettingsArea) => void;
  /** Left or Back: hand the keyboard back to the rail, keeping the panel open. */
  onExit: () => void;
  /** The pointer moved onto the panel. Leaving it is the rail's: the panel sits in its flyout. */
  onPointerEnter: () => void;
}

/**
 * The settings panel beside the rail, replacing the settings page: one ListItem per area. While
 * it has the keyboard it is a contained scope of the navigation layer (Up/Down move, OK opens the
 * area, the ends stay put); Left or Back hand the keyboard back to the rail.
 */
export const SettingsMenu: FC<SettingsMenuProps> = ({
  areas,
  serverAddress,
  focused,
  onOpen,
  onExit,
  onPointerEnter,
}) => {
  const bottom = useFlyoutBottom(`[${SETTINGS_RAIL_ITEM_ATTRIBUTE}]`);
  const placed = bottom !== null;
  const inUse = focused && placed;
  const keysRef = useKeyboardNavigation({
    enabled: inUse,
    onLeft: () => {
      onExit();
      return true;
    },
    onBack: () => {
      onExit();
      return true;
    },
    onRight: () => true,
  });

  const list = (
    <List labelledBy="settings-menu-title">
      {areas.map(area => (
        <ListItem
          key={area}
          // Only an open panel registers its areas, so the rail never moves into it
          navId={inUse ? SETTINGS_MENU_NAV.area(area) : undefined}
          leading={AREAS[area].icon}
          title={AREAS[area].title}
          description={area === 'server' ? serverAddress : DESCRIPTIONS[area]}
          onClick={() => onOpen(area)}
        />
      ))}
    </List>
  );

  return (
    <div
      ref={keysRef}
      className={styles.zone}
      {...{ [SETTINGS_PANEL_ATTRIBUTE]: '' }}
      // Bottom-aligned with Settings on the rail; hidden for the moment before it is measured
      style={{ bottom: bottom ?? undefined, visibility: placed ? undefined : 'hidden' }}
      onMouseEnter={onPointerEnter}
    >
      <section className={styles.panel} aria-labelledby="settings-menu-title">
        <div className={styles.header}>
          <Heading level={2} variant="heading" id="settings-menu-title">
            Settings
          </Heading>
        </div>
        {inUse && areas[0] ? (
          <FocusScope
            id={SETTINGS_MENU_NAV.scope}
            contain
            initialId={SETTINGS_MENU_NAV.area(areas[0])}
          >
            {list}
          </FocusScope>
        ) : (
          list
        )}
      </section>
    </div>
  );
};
