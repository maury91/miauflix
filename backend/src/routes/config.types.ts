export type {
  ConfigEntryView,
  UpdateConfigsResult,
} from '@services/configuration/configuration.types';

export type UpdateConfigRequest = { entries: { key: string; value: string }[] };

export type SetupStatusResponse = { available: boolean };
