import {
  useGetConfigQuery,
  useSaveServiceConfigMutation,
  useTestServiceConfigMutation,
  useUpdateConfigMutation,
} from '@features/config/api/config.api';
import type { ConfigServiceActionResult } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import { motion } from 'framer-motion';
import type { FC } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import { ServiceConfigGroup } from './components/ServiceConfigGroup';
import { useConfigForm } from './hooks/useConfigForm';
import { preserveInitialServiceOrder, sortServiceGroups } from './config.utils';

import LineMdAlertCircleTwotone from '~icons/line-md/alert-circle-twotone';

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
  padding: 132px 24px 40px;

  @media (max-width: 720px) {
    padding-top: 96px;
  }
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
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: ${PALETTE.color.dangerSubtle};
  border: 1px solid ${PALETTE.color.brand};
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 24px;
  font-size: 13px;
  color: #eee;
`;

const MissingConfigIcon = styled(LineMdAlertCircleTwotone)`
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  color: ${PALETTE.color.brand};
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
  background-color: ${PALETTE.color.brand};
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  font-family: 'Poppins', sans-serif;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${PALETTE.color.brandHover};
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
    props.$isError ? PALETTE.color.dangerSubtle : 'rgba(76, 175, 80, 0.1)'};
  border: 1px solid
    ${props => (props.$isError ? PALETTE.color.dangerBorder : 'rgba(76, 175, 80, 0.3)')};
  color: ${props => (props.$isError ? PALETTE.color.danger : '#81c784')};
`;

interface ConfigWizardPageProps {
  onDismiss: () => void;
}

const ConfigWizardPage: FC<ConfigWizardPageProps> = ({ onDismiss }) => {
  const { data: configEntries = [], isLoading } = useGetConfigQuery(undefined);
  const [updateConfig, { isLoading: isSaving }] = useUpdateConfigMutation();
  const [testServiceConfig] = useTestServiceConfigMutation();
  const [saveServiceConfig] = useSaveServiceConfigMutation();
  const [globalResult, setGlobalResult] = useState<{ success: boolean; message: string } | null>(
    null
  );
  const [serviceResults, setServiceResults] = useState<Record<string, ConfigServiceActionResult>>(
    {}
  );
  const [serviceActions, setServiceActions] = useState<Record<string, 'test' | 'save'>>({});
  const [serviceNotices, setServiceNotices] = useState<
    Record<string, { restarted?: boolean; needsProcessRestart?: boolean }>
  >({});
  const [initialGroupOrder, setInitialGroupOrder] = useState<string[] | null>(null);

  const {
    values,
    dirtyServices,
    handleChange,
    getSubmittableEntries,
    getServiceEntries,
    markServiceSaved,
  } = useConfigForm(configEntries);

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

  const initiallySortedGroups = useMemo(() => sortServiceGroups(groupedEntries), [groupedEntries]);

  useEffect(() => {
    if (initialGroupOrder === null && initiallySortedGroups.length > 0) {
      setInitialGroupOrder(initiallySortedGroups.map(([serviceName]) => serviceName));
    }
  }, [initialGroupOrder, initiallySortedGroups]);

  const sortedGroups = useMemo(
    () => preserveInitialServiceOrder(initiallySortedGroups, initialGroupOrder),
    [initialGroupOrder, initiallySortedGroups]
  );

  const errorMessage = (error: unknown, fallback: string) => {
    const errorData = error as { data?: string };
    return errorData.data ?? fallback;
  };

  const handleFieldChange = useCallback(
    (key: string, value: string) => {
      handleChange(key, value);
      const service = configEntries.find(entry => entry.key === key)?.serviceGroup;
      if (!service) return;
      setServiceResults(current => {
        const next = { ...current };
        delete next[service];
        return next;
      });
      setServiceNotices(current => {
        const next = { ...current };
        delete next[service];
        return next;
      });
      setGlobalResult(null);
    },
    [configEntries, handleChange]
  );

  const handleServiceTest = useCallback(
    async (service: string) => {
      setServiceActions(current => ({ ...current, [service]: 'test' }));
      setServiceNotices(current => {
        const next = { ...current };
        delete next[service];
        return next;
      });
      try {
        const response = await testServiceConfig({ service, entries: getServiceEntries(service) });
        const result =
          'data' in response
            ? response.data?.services.find(item => item.service === service)
            : undefined;
        setServiceResults(current => ({
          ...current,
          [service]: result ?? {
            service: service as ConfigServiceActionResult['service'],
            success: false,
            testMode: 'validation',
            message:
              'error' in response
                ? errorMessage(response.error, `Failed to test ${service}.`)
                : `No test result was returned for ${service}.`,
          },
        }));
      } finally {
        setServiceActions(current => {
          const next = { ...current };
          delete next[service];
          return next;
        });
      }
    },
    [getServiceEntries, testServiceConfig]
  );

  const handleServiceSave = useCallback(
    async (service: string) => {
      setServiceActions(current => ({ ...current, [service]: 'save' }));
      try {
        const response = await saveServiceConfig({ service, entries: getServiceEntries(service) });
        if ('error' in response) {
          setServiceResults(current => ({
            ...current,
            [service]: {
              service: service as ConfigServiceActionResult['service'],
              success: false,
              testMode: 'validation',
              message: errorMessage(response.error, `Failed to save ${service}.`),
            },
          }));
          return;
        }
        const result = response.data.services.find(item => item.service === service);
        if (result) {
          const savedResult =
            response.data.success && !response.data.changed.includes(service as never)
              ? {
                  ...result,
                  message: `${service} configuration is valid. No changes to save.`,
                }
              : result;
          setServiceResults(current => ({ ...current, [service]: savedResult }));
        }
        setServiceNotices(current => ({
          ...current,
          [service]: {
            restarted: response.data.restarted.includes(service as never),
            needsProcessRestart: response.data.needsProcessRestart.includes(service as never),
          },
        }));
        if (response.data.success) markServiceSaved(service);
      } finally {
        setServiceActions(current => {
          const next = { ...current };
          delete next[service];
          return next;
        });
      }
    },
    [getServiceEntries, markServiceSaved, saveServiceConfig]
  );

  const handleSave = useCallback(async () => {
    const entries = getSubmittableEntries();
    if (entries.length === 0) {
      setGlobalResult({ success: true, message: 'No changes to save.' });
      return;
    }

    const servicesBeingSaved = [...dirtyServices];
    const result = await updateConfig({ entries });

    if ('error' in result) {
      setGlobalResult({
        success: false,
        message: errorMessage(result.error, 'Failed to save configuration.'),
      });
    } else {
      setServiceResults(current => ({
        ...current,
        ...Object.fromEntries(result.data.services.map(item => [item.service, item])),
      }));
      setServiceNotices(current => ({
        ...current,
        ...Object.fromEntries(
          servicesBeingSaved.map(service => [
            service,
            {
              restarted: result.data.restarted.includes(service as never),
              needsProcessRestart: result.data.needsProcessRestart.includes(service as never),
            },
          ])
        ),
      }));
      setGlobalResult({
        success: result.data.success,
        message: result.data.success
          ? 'Configuration saved successfully.'
          : 'No changes were saved because one or more services failed testing.',
      });
      if (result.data.success) servicesBeingSaved.forEach(markServiceSaved);
    }
  }, [dirtyServices, getSubmittableEntries, markServiceSaved, updateConfig]);

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
            <MissingConfigIcon aria-hidden="true" />
            <span>The following services need configuration: {missingGroups.join(', ')}</span>
          </MissingConfigBanner>
        )}

        {sortedGroups.map(([groupName, entries]) => (
          <ServiceConfigGroup
            key={groupName}
            groupName={groupName}
            entries={entries}
            values={values}
            onChange={handleFieldChange}
            onTest={() => handleServiceTest(groupName)}
            onSave={() => handleServiceSave(groupName)}
            hasChanges={dirtyServices.has(groupName)}
            activeAction={serviceActions[groupName]}
            disabled={isSaving}
            result={serviceResults[groupName]}
            restarted={serviceNotices[groupName]?.restarted}
            needsProcessRestart={serviceNotices[groupName]?.needsProcessRestart}
          />
        ))}

        {globalResult && (
          <StatusMessage $isError={!globalResult.success}>{globalResult.message}</StatusMessage>
        )}

        <Footer>
          <SaveButton
            onClick={handleSave}
            disabled={
              isSaving || dirtyServices.size === 0 || Object.keys(serviceActions).length > 0
            }
          >
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </SaveButton>
          <SkipButton onClick={onDismiss}>Go to Home</SkipButton>
        </Footer>
      </ContentWrapper>
    </PageContainer>
  );
};

export default ConfigWizardPage;
