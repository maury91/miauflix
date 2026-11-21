import { useGetConfigQuery, useSaveServiceConfigMutation } from '@features/config/api/config.api';
import { useConfigForm } from '@pages/config/hooks/useConfigForm';
import { useCallback, useMemo, useState } from 'react';

import { parseSize, STORAGE_SETTINGS_GROUP, storageSettingEntries } from './storageSettingsFields';

export type StorageSettingsOutcome =
  | { tone: 'success'; message: string }
  | { tone: 'danger'; message: string };

/**
 * Media-load's storage settings as a form: the stored values, edits not saved yet, and saving
 * them. Only these keys are sent; media-load keeps its other settings as they are and applies
 * these without a restart.
 */
export function useStorageSettings({ onSaved }: { onSaved?: () => void } = {}) {
  const config = useGetConfigQuery(undefined);
  const [saveServiceConfig, saving] = useSaveServiceConfigMutation();
  const entries = useMemo(() => storageSettingEntries(config.data ?? []), [config.data]);
  const form = useConfigForm(entries);
  const [outcome, setOutcome] = useState<StorageSettingsOutcome | null>(null);
  const hasChanges = form.dirtyServices.has(STORAGE_SETTINGS_GROUP);
  const { handleChange, getServiceEntries, markServiceSaved } = form;

  const change = useCallback(
    (key: string, value: string) => {
      setOutcome(null);
      handleChange(key, value);
    },
    [handleChange]
  );

  const save = useCallback(async () => {
    setOutcome(null);
    const submitted = getServiceEntries(STORAGE_SETTINGS_GROUP);
    const response = await saveServiceConfig({
      service: STORAGE_SETTINGS_GROUP,
      entries: submitted,
    });
    const result = 'data' in response ? response.data : undefined;
    if (result?.success) {
      // Edits made while it was saving stay to be saved
      markServiceSaved(STORAGE_SETTINGS_GROUP, submitted);
      setOutcome({ tone: 'success', message: 'Storage settings saved.' });
      onSaved?.();
      return;
    }
    const invalid = result?.invalidKeys ?? [];
    const failures = (result?.services ?? []).filter(item => !item.success);
    setOutcome({
      tone: 'danger',
      message: invalid.length
        ? `Check these values: ${invalid.join(', ')}.`
        : failures.length
          ? failures.map(item => item.message).join(' · ')
          : 'Could not save the storage settings. Please try again.',
    });
  }, [getServiceEntries, markServiceSaved, onSaved, saveServiceConfig]);

  return {
    entries,
    values: form.values,
    change,
    save,
    hasChanges,
    saving: saving.isLoading,
    outcome,
    loading: config.isLoading,
    failed: Boolean(config.error) && !config.data,
    /** The limit and playback reserve as typed, for the disk bar (null while not a size). */
    draft: {
      limitBytes: parseSize(form.values['STORAGE_THRESHOLD']),
      reserveBytes: parseSize(form.values['STORAGE_PLAYBACK_RESERVE']),
    },
  };
}

export type StorageSettingsForm = ReturnType<typeof useStorageSettings>;
