import type { EnvironmentVariableTypes } from '@services/configuration/configuration.types';

export type BaseVariableInfo = {
  description: string;
  example?: string;
  link?: string;
  required: boolean;
};

type VariableOptions<T> = Record<Extract<T, string>, string>;

type PasswordVariableInfo = BaseVariableInfo & {
  password: true;
  skipUserInteraction?: false;
};

export type DefaultVariableInfo = BaseVariableInfo & {
  defaultValue: string | (() => string);
  password?: false;
  skipUserInteraction?: boolean;
};

type DefaultVariableInfoWithTransform<T> = DefaultVariableInfo & {
  options?: VariableOptions<T>;
  transform: ValidatorTransform<T>;
};

export type SkipUserInteractionVariableInfo = BaseVariableInfo & {
  skipUserInteraction: true;
  defaultValue: string | (() => string);
  password?: false;
};

type SkipUserInteractionVariableInfoWithTransform<T> = SkipUserInteractionVariableInfo & {
  options?: VariableOptions<T>;
  transform: ValidatorTransform<T>;
};

type BaseVariableInfoWithTransform<T> = BaseVariableInfo & {
  options?: VariableOptions<T>;
  transform: ValidatorTransform<T>;
};

export type UnTypedVariableInfo =
  | BaseVariableInfo
  | DefaultVariableInfo
  | PasswordVariableInfo
  | SkipUserInteractionVariableInfo;

export type VariableInfo =
  | BaseVariableInfoWithTransform<unknown>
  | DefaultVariableInfoWithTransform<unknown>
  | SkipUserInteractionVariableInfoWithTransform<unknown>
  | UnTypedVariableInfo;

export type ServiceVariables<T extends Record<string, VariableInfo>> = T;

export type ServiceInstanceStatus =
  | { status: 'error'; errorMessage: string; error: unknown }
  | { status: 'initializing' | `initializing_${string}`; details: string; startedAt: number }
  | { status: 'ready' };

export type ConfigurableService = {
  getStatus(): ServiceInstanceStatus;
  reload(): Promise<void>;
};

export type ConfigService = {
  get<K extends keyof EnvironmentVariableTypes>(key: K): EnvironmentVariableTypes[K] | undefined;
  getOrThrow<K extends keyof EnvironmentVariableTypes>(key: K): EnvironmentVariableTypes[K];
  registerService(key: string, instance: ConfigurableService): void;
};

export type ServiceConfiguration<T extends Record<string, VariableInfo>> = {
  name: string;
  description: string;
  variables: ServiceVariables<T>;
  /** If false, config changes require a process restart — the service cannot reload at runtime */
  restartable?: false;
};

export type ValidationTransformResult<T> = {
  isValid: boolean;
  error?: string;
  suggestions?: string[];
  value?: T; // Transformed value if valid
};

export type ValidatorTransform<T> = (value: string) => ValidationTransformResult<T>;

export type ValidatedVariableInfo<T = unknown> =
  | BaseVariableInfoWithTransform<T>
  | DefaultVariableInfoWithTransform<T>
  | SkipUserInteractionVariableInfoWithTransform<T>;

// Type extraction system for environment variables
export type ExtractTransformType<T> = T extends ValidatedVariableInfo<infer R> ? R : string;

export type ExtractServiceVariables<T> =
  T extends ServiceConfiguration<infer V> ? { [K in keyof V]: ExtractTransformType<V[K]> } : never;

export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;
