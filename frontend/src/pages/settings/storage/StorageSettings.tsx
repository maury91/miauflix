import type { ConfigEntryView } from '@miauflix/backend';
import { ConfigField } from '@pages/config/components/ConfigField';
import {
  ActionGroup,
  Button,
  Disclosure,
  Heading,
  Message,
  ProgressSpinner,
  Stack,
  Surface,
  Text,
} from '@shared/design-system';
import { FocusGroup } from '@shared/navigation';
import { useId, useState } from 'react';

import { formatBytes } from './storageInventory';
import * as styles from './storageSettings.css';
import {
  ADVANCED_STORAGE_KEYS,
  fromFieldValue,
  MAIN_STORAGE_KEYS,
  storageFieldEntry,
  toFieldValue,
} from './storageSettingsFields';
import type { StorageSettingsForm } from './useStorageSettings';

const STORAGE_SETTINGS_NAV = {
  group: 'storage-settings',
  advanced: 'storage-settings:advanced',
  actions: 'storage-settings:actions',
  save: 'storage-settings:save',
} as const;

interface StorageSettingsProps {
  form: StorageSettingsForm;
  /**
   * The most Miauflix could hold on this disk (free space plus what it holds now); null when the
   * disk's size is unknown.
   */
  capacityBytes: number | null;
}

/**
 * Media-load's storage settings, where their effect shows: the limit and playback reserve (drawn
 * on the disk bar as they're typed), how long finished downloads seed, and where files go. The
 * same values stay editable on the Configuration page.
 */
export function StorageSettings({ form, capacityBytes }: StorageSettingsProps) {
  const titleId = useId();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { limitBytes, reserveBytes } = form.draft;
  const byKey = (keys: readonly string[]) => form.entries.filter(entry => keys.includes(entry.key));

  const field = (entry: ConfigEntryView) => (
    <ConfigField
      key={entry.key}
      entry={storageFieldEntry(entry)}
      value={toFieldValue(entry.key, form.values[entry.key] ?? '')}
      onChange={(key, value) => form.change(key, fromFieldValue(key, value))}
    />
  );

  const warnings = [
    capacityBytes !== null && limitBytes !== null && limitBytes > capacityBytes
      ? `The limit is more than this disk can give Miauflix (${formatBytes(capacityBytes)}): downloads will stop when the disk fills before the limit is reached.`
      : null,
    limitBytes !== null && reserveBytes !== null && reserveBytes >= limitBytes && limitBytes > 0
      ? 'The playback reserve takes the whole limit, so nothing downloads ahead of time.'
      : null,
  ].filter((warning): warning is string => warning !== null);

  return (
    <FocusGroup id={STORAGE_SETTINGS_NAV.group} layout="vertical">
      <Surface as="section" aria-labelledby={titleId} border radius="lg" padding="lg">
        <Stack gap="lg">
          <div>
            <Heading level={2} id={titleId} variant="heading">
              Storage settings
            </Heading>
            <div className={styles.description}>
              <Text tone="secondary">
                How much Miauflix may keep, how much stays free for playback, and how long finished
                downloads keep sharing. Changes apply without a restart.
              </Text>
            </div>
          </div>

          {form.loading && <ProgressSpinner label="Loading storage settings…" />}
          {form.failed && (
            <Message tone="danger" toneLabel="Error">
              Could not load the storage settings. They can still be changed on the Configuration
              page.
            </Message>
          )}

          {byKey(MAIN_STORAGE_KEYS).map(field)}

          {warnings.map(warning => (
            <Message key={warning} tone="warning" toneLabel="Warning">
              {warning}
            </Message>
          ))}

          {byKey(ADVANCED_STORAGE_KEYS).length > 0 && (
            <Disclosure
              navId={STORAGE_SETTINGS_NAV.advanced}
              title="Advanced"
              description="The download folder and how files are written to it."
              headingLevel={3}
              expanded={advancedOpen}
              onExpandedChange={setAdvancedOpen}
            >
              <Stack gap="lg">{byKey(ADVANCED_STORAGE_KEYS).map(field)}</Stack>
            </Disclosure>
          )}

          {form.entries.length > 0 && (
            <ActionGroup navId={STORAGE_SETTINGS_NAV.actions} label="Storage settings actions">
              <Button
                navId={STORAGE_SETTINGS_NAV.save}
                loading={form.saving}
                disabled={!form.hasChanges}
                onClick={() => void form.save()}
              >
                {form.saving ? 'Saving' : 'Save'}
              </Button>
            </ActionGroup>
          )}

          <div role="status" aria-live="polite">
            {form.outcome?.tone === 'success' && (
              <Message tone="success">{form.outcome.message}</Message>
            )}
          </div>
          {form.outcome?.tone === 'danger' && (
            <Message tone="danger" toneLabel="Error" live="assertive">
              {form.outcome.message}
            </Message>
          )}
        </Stack>
      </Surface>
    </FocusGroup>
  );
}
