import { changeTvServer } from '@features/server-discovery/lib/connect';
import { displayServerAddress } from '@features/server-discovery/lib/server-address';
import { API_URL, builtForTizen, SETTINGS_PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { Button } from '@shared/ui';
import { BackRail } from '@shared/ui/rail/BackRail';
import { useRailContentLeft } from '@shared/ui/rail/useRailContentLeft';
import { useEffect, useRef } from 'react';
import styled from 'styled-components';

const Page = styled.main`
  position: fixed;
  inset: 0;
  overflow-y: auto;
  z-index: 1000;
  background: ${SETTINGS_PALETTE.background.primary};
  color: ${SETTINGS_PALETTE.text.primary};
  font-family: 'Poppins', sans-serif;
`;

const Content = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 132px 24px 40px;

  @media (max-width: 720px) {
    padding-top: 96px;
  }
`;

const Title = styled.h1`
  margin: 0 0 24px;
  font-size: 28px;
  font-weight: 400;
`;

const Description = styled.p`
  margin: 12px 0 28px;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 14px;
  line-height: 1.5;
`;

interface SettingsPageProps {
  canConfigure: boolean;
  onConfiguration: () => void;
  canManageStorage: boolean;
  onStorage: () => void;
  initialFocus?: 'configuration' | 'storage';
  onDismiss: () => void;
}

export default function SettingsPage({
  canConfigure,
  onConfiguration,
  canManageStorage,
  onStorage,
  initialFocus = 'configuration',
  onDismiss,
}: SettingsPageProps) {
  const configurationRef = useRef<HTMLButtonElement>(null);
  const storageRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useRailContentLeft();

  useEffect(() => {
    const target =
      initialFocus === 'storage' && canManageStorage
        ? storageRef.current
        : canConfigure
          ? configurationRef.current
          : canManageStorage
            ? storageRef.current
            : backRef.current;
    target?.focus({ preventScroll: true });
  }, [canConfigure, canManageStorage, initialFocus]);

  const moveFocus = (direction: -1 | 1) => {
    const buttons = [
      ...Array.from(contentRef.current?.querySelectorAll('button') ?? []),
      backRef.current,
    ].filter((button): button is HTMLButtonElement => Boolean(button && !button.disabled));
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      currentIndex < 0 ? 0 : (currentIndex + direction + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus({ preventScroll: true });
    return true;
  };
  const firstEnabled = () =>
    [configurationRef.current, storageRef.current].find(button => button && !button.disabled);
  const navigationRef = useKeyboardNavigation({
    onUp: () => moveFocus(-1),
    onDown: () => moveFocus(1),
    // Back sits on the rail to the left of the page.
    onLeft: () => {
      backRef.current?.focus({ preventScroll: true });
      return true;
    },
    onRight: () => {
      if (document.activeElement === backRef.current)
        firstEnabled()?.focus({ preventScroll: true });
      return true;
    },
    onBack: () => {
      onDismiss();
      return true;
    },
  });

  return (
    <Page ref={navigationRef} aria-labelledby="settings-title">
      <Content ref={contentRef}>
        <Title id="settings-title">Settings</Title>
        <Button
          ref={configurationRef}
          appearance="settings"
          color="secondary"
          fullWidth
          disabled={!canConfigure}
          onClick={onConfiguration}
        >
          Configuration
        </Button>
        <Button
          ref={storageRef}
          appearance="settings"
          color="secondary"
          fullWidth
          disabled={!canManageStorage}
          onClick={onStorage}
        >
          Storage
        </Button>
        {builtForTizen && (
          <Button appearance="settings" color="secondary" fullWidth onClick={changeTvServer}>
            Change server ({displayServerAddress(API_URL)})
          </Button>
        )}
        <Description>
          {canConfigure
            ? 'Manage services, integrations, server configuration, and downloaded storage.'
            : 'Configuration and storage management are available to administrators.'}
        </Description>
      </Content>
      <BackRail ref={backRef} label="Back to Home" onBack={onDismiss} />
    </Page>
  );
}
