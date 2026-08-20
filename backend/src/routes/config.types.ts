export type {
  ConfigEntryView,
  ConfigServiceActionResult,
  SaveConfigsResult,
  TestConfigsResult,
  UpdateConfigsResult,
} from '@services/configuration/configuration.types';

export type UpdateConfigRequest = { entries: { key: string; value: string }[] };
export type ServiceConfigRequest = UpdateConfigRequest;

export type SetupStatusResponse = { available: boolean };
