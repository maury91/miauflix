import { useGetConfigQuery, useUpdateConfigMutation } from '@features/config/api/config.api';
import { motion } from 'framer-motion';
import type { FC } from 'react';
import { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';

import { ServiceConfigGroup } from './components/ServiceConfigGroup';
import { useConfigForm } from './hooks/useConfigForm';

const PageContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: #0a0d0f;
  color: white;
  font-family: 'Poppins', sans-serif;
  overflow-y: auto;
  z-index: 1000;
`;

const ContentWrapper = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 24px;
`;

const PageHeader = styled.div`
  margin-bottom: 32px;
`;

const PageTitle = styled.h1`
  font-size: 28px;
  font-weight: 400;
  margin: 0 0 8px 0;
  color: #ffffff;
`;

const PageSubtitle = styled.p`
  font-size: 14px;
  color: #888;
  margin: 0;
  line-height: 1.5;
`;

const MissingConfigBanner = styled.div`
  background-color: rgba(219, 32, 44, 0.1);
  border: 1px solid rgba(219, 32, 44, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 24px;
  font-size: 13px;
  color: #ff6b6b;
`;

const Footer = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #191e23;
`;

const SaveButton = styled.button`
  padding: 10px 24px;
  background-color: #db202c;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  font-family: 'Poppins', sans-serif;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #c01e28;
  }

  &:disabled {
    background-color: #444;
    cursor: not-allowed;
  }
`;

const SkipButton = styled.button`
  padding: 10px 24px;
  background-color: transparent;
  color: #888;
  border: 1px solid #444;
  border-radius: 4px;
  font-size: 14px;
  font-family: 'Poppins', sans-serif;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    color: #ccc;
    border-color: #666;
  }
`;

const StatusMessage = styled.div<{ $isError?: boolean }>`
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
  margin-top: 16px;
  background-color: ${props =>
    props.$isError ? 'rgba(219, 32, 44, 0.1)' : 'rgba(76, 175, 80, 0.1)'};
  border: 1px solid
    ${props => (props.$isError ? 'rgba(219, 32, 44, 0.3)' : 'rgba(76, 175, 80, 0.3)')};
  color: ${props => (props.$isError ? '#ff6b6b' : '#81c784')};
`;

const RestartNotice = styled.div`
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
  margin-top: 12px;
  background-color: rgba(255, 152, 0, 0.1);
  border: 1px solid rgba(255, 152, 0, 0.3);
  color: #ffb74d;
`;

interface ConfigWizardPageProps {
  onDismiss: () => void;
}

const ConfigWizardPage: FC<ConfigWizardPageProps> = ({ onDismiss }) => {
  const { data: configEntries = [], isLoading } = useGetConfigQuery(undefined);
  const [updateConfig, { isLoading: isSaving }] = useUpdateConfigMutation();
  const [saveResult, setSaveResult] = useState<{
    success: boolean;
    message: string;
    needsProcessRestart?: string[];
    restarting?: string[];
  } | null>(null);

  const { values, handleChange, getSubmittableEntries } = useConfigForm(configEntries);

  const groupedEntries = useMemo(() => {
    const groups: Record<string, typeof configEntries> = {};
    for (const entry of configEntries) {
      if (!groups[entry.serviceGroup]) {
        groups[entry.serviceGroup] = [];
      }
      groups[entry.serviceGroup].push(entry);
    }
    return groups;
  }, [configEntries]);

  const missingGroups = useMemo(() => {
    return Object.entries(groupedEntries)
      .filter(([, entries]) => entries.some(e => e.required && !e.hasValue))
      .map(([group]) => group);
  }, [groupedEntries]);

  const handleSave = useCallback(async () => {
    const entries = getSubmittableEntries();
    if (entries.length === 0) {
      setSaveResult({ success: true, message: 'No changes to save.' });
      return;
    }

    const result = await updateConfig({ entries });

    if ('error' in result) {
      const errorData = result.error as { data?: string };
      setSaveResult({
        success: false,
        message: errorData.data ?? 'Failed to save configuration.',
      });
    } else {
      const { restarting, needsProcessRestart } = result.data;
      setSaveResult({
        success: true,
        message: 'Configuration saved successfully.',
        restarting,
        needsProcessRestart,
      });
    }
  }, [getSubmittableEntries, updateConfig]);

  if (isLoading) {
    return (
      <PageContainer initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <ContentWrapper>
          <PageHeader>
            <PageTitle>Loading configuration...</PageTitle>
          </PageHeader>
        </ContentWrapper>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <ContentWrapper>
        <PageHeader>
          <PageTitle>Configuration</PageTitle>
          <PageSubtitle>
            Configure your Miauflix instance. Required fields must be filled before services can
            start.
          </PageSubtitle>
        </PageHeader>

        {missingGroups.length > 0 && (
          <MissingConfigBanner>
            The following services need configuration: {missingGroups.join(', ')}
          </MissingConfigBanner>
        )}

        {Object.entries(groupedEntries).map(([groupName, entries]) => (
          <ServiceConfigGroup
            key={groupName}
            groupName={groupName}
            entries={entries}
            values={values}
            onChange={handleChange}
          />
        ))}

        {saveResult && (
          <StatusMessage $isError={!saveResult.success}>{saveResult.message}</StatusMessage>
        )}

        {saveResult?.success && saveResult.restarting && saveResult.restarting.length > 0 && (
          <RestartNotice>Restarting services: {saveResult.restarting.join(', ')}</RestartNotice>
        )}

        {saveResult?.success &&
          saveResult.needsProcessRestart &&
          saveResult.needsProcessRestart.length > 0 && (
            <RestartNotice>
              The following services require a full process restart to apply changes:{' '}
              {saveResult.needsProcessRestart.join(', ')}
            </RestartNotice>
          )}

        <Footer>
          <SaveButton onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </SaveButton>
          <SkipButton onClick={onDismiss}>Go to Home</SkipButton>
        </Footer>
      </ContentWrapper>
    </PageContainer>
  );
};

export default ConfigWizardPage;
