import { call, contract, event, methodName } from './define.js';

/** Every service implements this contract; the runtime does it from the service definition. */

export type ServiceLifecycleState = 'standby' | 'configuring' | 'ready' | 'degraded' | 'error';

export interface ServiceStatus {
  state: ServiceLifecycleState;
  message?: string;
  errorCode?: string;
  missingConfiguration?: string[];
  details?: Record<string, unknown>;
}

export type ConfigInputType = 'boolean' | 'number' | 'password' | 'select' | 'text';

export interface ConfigVariable {
  key: string;
  description: string;
  label?: string;
  required: boolean;
  advanced?: boolean;
  skipUserInteraction?: boolean;
  secret?: boolean;
  inputType: ConfigInputType;
  defaultValue?: string;
  defaultValueSource?: 'browser-origin';
  example?: string;
  options?: Record<string, string>;
  numberOptions?: { min?: number; max?: number; integer?: boolean };
  booleanStateDescriptions?: { true: string; false: string };
  link?: string;
  linkLabel?: string;
  testRelevant?: boolean;
  testFailureHelp?: string;
}

export interface ServiceConfigGroup {
  id: string;
  name: string;
  description: string;
  variables: ConfigVariable[];
}

export interface ServiceConfigSchema {
  groups: ServiceConfigGroup[];
}

export interface ServiceConfigTestResult {
  success: boolean;
  mode: 'live' | 'validation';
  message: string;
  invalidKeys?: string[];
}

export interface ServiceConfigApplyResult {
  success: boolean;
  activated: boolean;
  invalidKeys?: string[];
  test?: ServiceConfigTestResult;
}

/** Sent by the service as the first frame of every connection. */
export interface ServiceHello {
  protocol: number;
  id: string;
  name: string;
  description: string;
  version: string;
  /** Contract name → every `major.minor` implemented (at most the current and previous major). */
  contracts: Record<string, string[]>;
}

export const management = contract('$', '1.0', {
  status: call<void, ServiceStatus>(),
  statusChanged: event<ServiceStatus>(),
  configSchema: call<void, ServiceConfigSchema>(),
  testConfig: call<{ values: Record<string, string> }, ServiceConfigTestResult>(),
  applyConfig: call<{ values: Record<string, string> }, ServiceConfigApplyResult>(),
  clearConfig: call<void, ServiceConfigApplyResult>(),
});

export type Management = typeof management;

/** Wire name of the status subscription every transport follows. */
export const STATUS_CHANGED = methodName(management, 'statusChanged');
