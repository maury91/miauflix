import { changeTvServer } from '@features/server-discovery/lib/connect';
import { displayServerAddress } from '@features/server-discovery/lib/server-address';
import { API_URL, builtForTizen } from '@shared/config/constants';
import {
  Heading,
  List,
  ListItem,
  NavItem,
  NavRail,
  ScrollArea,
  SurfaceContextProvider,
  Text,
} from '@shared/design-system';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { FocusScope, NavigationProvider } from '@shared/navigation';

import * as styles from './settingsPage.css';

import ArrowLeftIcon from '~icons/mdi/arrow-left';
import ConfigurationIcon from '~icons/mdi/cog-outline';
import StorageIcon from '~icons/mdi/harddisk';
import SourcesIcon from '~icons/mdi/layers-outline';
import ServerIcon from '~icons/mdi/server-network';

const NAV = {
  scope: 'settings',
  rail: 'settings-rail',
  back: 'settings-back',
  list: 'settings-list',
  configuration: 'settings-configuration',
  storage: 'settings-storage',
  sources: 'settings-sources',
  server: 'settings-server',
} as const;

interface SettingsPageProps {
  canConfigure: boolean;
  onConfiguration: () => void;
  canManageStorage: boolean;
  onStorage: () => void;
  canManageSources: boolean;
  onSources: () => void;
  initialFocus?: 'configuration' | 'storage' | 'sources';
  onDismiss: () => void;
}

/**
 * The settings hub on the design system: the back rail, then one ListItem per settings area. The
 * screen is one navigation scope; areas a non-administrator cannot open stay visible, disabled.
 */
export default function SettingsPage(props: SettingsPageProps) {
  // Back leaves the page. An element scope, so it wins over the page-wide navigation keys.
  const pageRef = useKeyboardNavigation({
    onBack: () => {
      props.onDismiss();
      return true;
    },
  });
  return (
    <main ref={pageRef} className={styles.page} aria-labelledby="settings-title">
      <NavigationProvider>
        <SettingsScreen {...props} />
      </NavigationProvider>
    </main>
  );
}

function SettingsScreen({
  canConfigure,
  onConfiguration,
  canManageStorage,
  onStorage,
  canManageSources,
  onSources,
  initialFocus = 'configuration',
  onDismiss,
}: SettingsPageProps) {
  // The requested area when it can be opened, else the first one that can, else Back
  const initialId =
    initialFocus === 'sources' && canManageSources
      ? NAV.sources
      : initialFocus === 'storage' && canManageStorage
        ? NAV.storage
        : canConfigure
          ? NAV.configuration
          : canManageStorage
            ? NAV.storage
            : canManageSources
              ? NAV.sources
              : builtForTizen
                ? NAV.server
                : NAV.back;

  return (
    <FocusScope id={NAV.scope} layout="horizontal" initialId={initialId}>
      <div className={styles.rail}>
        <NavRail label="Settings" navId={NAV.rail}>
          <NavItem navId={NAV.back} icon={<ArrowLeftIcon />} label="Back" onClick={onDismiss} />
        </NavRail>
      </div>
      <SurfaceContextProvider value="solid">
        <div className={styles.body}>
          <ScrollArea>
            <div className={styles.content}>
              <div className={styles.title}>
                <Heading level={1} id="settings-title">
                  Settings
                </Heading>
              </div>
              <List labelledBy="settings-title" navId={NAV.list}>
                <ListItem
                  navId={NAV.configuration}
                  title="Configuration"
                  description="Services, integrations and server configuration"
                  leading={<ConfigurationIcon />}
                  disabled={!canConfigure}
                  onClick={onConfiguration}
                />
                <ListItem
                  navId={NAV.storage}
                  title="Storage"
                  description="Downloaded files and the space they use"
                  leading={<StorageIcon />}
                  disabled={!canManageStorage}
                  onClick={onStorage}
                />
                <ListItem
                  navId={NAV.sources}
                  title="Sources"
                  description="Source providers and the order they are searched in"
                  leading={<SourcesIcon />}
                  disabled={!canManageSources}
                  onClick={onSources}
                />
                {builtForTizen && (
                  <ListItem
                    navId={NAV.server}
                    title="Change server"
                    description={displayServerAddress(API_URL)}
                    leading={<ServerIcon />}
                    onClick={changeTvServer}
                  />
                )}
              </List>
              {!canConfigure && (
                <div className={styles.note}>
                  <Text tone="secondary">
                    Configuration, storage and source management are available to administrators.
                  </Text>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </SurfaceContextProvider>
    </FocusScope>
  );
}
