import type {
  ExtractServiceVariables,
  ServiceConfiguration,
  ServiceInstanceStatus,
  UnionToIntersection,
  VariableInfo,
} from '@mytypes/configuration';
import type { services } from '@services/configuration/configuration.consts';

export type ServiceStatusEntry =
  | ServiceInstanceStatus
  | {
      status: 'needs_configuration';
      missingVars?: string[];
    };

export interface ConfigEntryView {
  key: string;
  value: string;
  isSecret: boolean;
  serviceGroup: string;
  description: string;
  required: boolean;
  hasValue: boolean;
}

export type ServiceName = keyof typeof services;
export type EnvironmentVariableTypes = UnionToIntersection<
  ExtractServiceVariables<(typeof services)[keyof typeof services]>
>;

/** Raw string values for one service’s variables (after prompting, all keys are set). */
export type ConfiguredServiceValues<S extends ServiceConfiguration<Record<string, VariableInfo>>> =
  Record<Extract<keyof S['variables'], string>, string>;
export type VariableName = keyof EnvironmentVariableTypes;
export type ExtendedVariableInfo = VariableInfo & {
  serviceName: ServiceName;
};

export type Variables = {
  [K in ServiceName]: keyof (typeof services)[K]['variables'];
}[ServiceName];

export type UpdateConfigsResult =
  | {
      success: false;
      invalidKeys: string[];
    }
  | {
      success: true;
      restarted: ServiceName[];
      needsProcessRestart: ServiceName[];
    };
