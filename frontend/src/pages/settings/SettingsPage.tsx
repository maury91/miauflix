import { SETTINGS_PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { ActionRow, Button } from '@shared/ui';
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

  const moveFocus = () => {
    const buttons = [configurationRef.current, storageRef.current, backRef.current].filter(
      (button): button is HTMLButtonElement => Boolean(button && !button.disabled)
    );
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(currentIndex + 1) % buttons.length]?.focus({ preventScroll: true });
    return true;
  };
  const navigationRef = useKeyboardNavigation({
    onUp: moveFocus,
    onDown: moveFocus,
    onBack: () => {
      onDismiss();
      return true;
    },
  });

  return (
    <Page ref={navigationRef} aria-labelledby="settings-title">
      <Content>
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
        <Description>
          {canConfigure
            ? 'Manage services, integrations, server configuration, and downloaded storage.'
            : 'Configuration and storage management are available to administrators.'}
        </Description>
        <ActionRow>
          <Button ref={backRef} appearance="settings" color="secondary" onClick={onDismiss}>
            Back to Home
          </Button>
        </ActionRow>
      </Content>
    </Page>
  );
}
