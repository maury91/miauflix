import {
  Container,
  Heading,
  NavItem,
  NavRail,
  SafeArea,
  ScrollArea,
  SurfaceContextProvider,
  Text,
} from '@shared/design-system';
import { usePageBack } from '@shared/hooks/usePageBack';
import { FocusGroup, FocusScope, NavigationProvider } from '@shared/navigation';
import { LogoBackdrop } from '@shared/ui/logo/LogoBackdrop';
import { useRailContentLeft } from '@shared/ui/rail/useRailContentLeft';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

import * as styles from './settingsLayout.css';

import ArrowLeftIcon from '~icons/mdi/arrow-left';

const SETTINGS_NAV = {
  scope: 'settings-page',
  rail: 'settings-rail',
  back: 'settings-back',
  content: 'settings-content',
} as const;

export interface SettingsLayoutProps {
  /** The page's title (its `h1`), which also names the page. */
  title: string;
  /** One or two sentences under the title. */
  description?: ReactNode;
  /**
   * Leave the page: the back rail's item and the remote's Back. Absent where there is nowhere to go
   * back to (the first-run configuration wizard).
   */
  onBack?: () => void;
  /** The back item's name ("Back to Home"). */
  backLabel?: string;
  /** The navId focused when the page opens; the scope's first child otherwise. */
  initialNavId?: string;
  /** `reading` (default) for settings and forms, `full` for wide tables. */
  width?: 'reading' | 'full';
  /** Shown instead of the page's own title and description (a wizard's step). */
  header?: ReactNode;
  /** Over the page and outside its navigation scope: a Dialog the page opens. */
  overlay?: ReactNode;
  children: ReactNode;
}

/**
 * The settings pages' frame: one navigation scope holding the back rail and the page, which scrolls
 * to keep the focused control in view. Back ends editing a field before leaving.
 */
export function SettingsLayout(props: SettingsLayoutProps) {
  const back = usePageBack(props.onBack);
  return (
    <motion.main
      {...back}
      className={styles.page}
      aria-labelledby={props.header ? undefined : `${SETTINGS_NAV.scope}-title`}
      aria-label={props.header ? props.title : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <NavigationProvider>
        <SettingsScreen {...props} />
      </NavigationProvider>
    </motion.main>
  );
}

function RailAlignment() {
  // The logo lines up with the content beside the back rail, as on the other inner pages
  useRailContentLeft();
  return null;
}

function SettingsScreen({
  title,
  description,
  onBack,
  backLabel = 'Back',
  initialNavId,
  width = 'reading',
  header,
  overlay,
  children,
}: SettingsLayoutProps) {
  return (
    <FocusScope id={SETTINGS_NAV.scope} layout="horizontal" initialId={initialNavId}>
      <LogoBackdrop />
      {onBack && (
        <div className={styles.rail}>
          <RailAlignment />
          <NavRail label={title} navId={SETTINGS_NAV.rail}>
            <NavItem
              navId={SETTINGS_NAV.back}
              icon={<ArrowLeftIcon />}
              label={backLabel}
              onClick={onBack}
            />
          </NavRail>
        </div>
      )}
      <SurfaceContextProvider value="solid">
        <div className={styles.body}>
          <ScrollArea>
            <SafeArea edges="x">
              <Container width={width}>
                <FocusGroup id={SETTINGS_NAV.content} layout="vertical">
                  <div className={styles.content}>
                    {header ?? (
                      <header className={styles.header}>
                        <Heading level={1} id={`${SETTINGS_NAV.scope}-title`}>
                          {title}
                        </Heading>
                        {description && (
                          <div className={styles.description}>
                            <Text tone="secondary">{description}</Text>
                          </div>
                        )}
                      </header>
                    )}
                    {children}
                  </div>
                </FocusGroup>
              </Container>
            </SafeArea>
          </ScrollArea>
        </div>
      </SurfaceContextProvider>
      {overlay}
    </FocusScope>
  );
}
