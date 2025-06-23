type BaseVariableInfo = {
  description: string;
  example?: string;
  link?: string;
  required: boolean;
};

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
  transform: ValidatorTransform<T>;
};

export type SkipUserInteractionVariableInfo = BaseVariableInfo & {
  skipUserInteraction: true;
  defaultValue: string | (() => string);
  password?: false;
};

type SkipUserInteractionVariableInfoWithTransform<T> = SkipUserInteractionVariableInfo & {
  transform: ValidatorTransform<T>;
};

export type UnTypedVariableInfo =
  | BaseVariableInfo
  | DefaultVariableInfo
  | PasswordVariableInfo
  | SkipUserInteractionVariableInfo;

export type VariableInfo =
  | DefaultVariableInfoWithTransform<unknown>
  | SkipUserInteractionVariableInfoWithTransform<unknown>
  | UnTypedVariableInfo;

export type ServiceVariables<T extends Record<string, VariableInfo>> = T;

export type ServiceConfiguration<T extends Record<string, VariableInfo>> = {
  name: string;
  description: string;
  variables: ServiceVariables<T>;
  test: () => Promise<void>;
};

export type ValidationTransformResult<T> = {
  isValid: boolean;
  error?: string;
  suggestions?: string[];
  value?: T; // Transformed value if valid
};

export type ValidatorTransform<T> = (value: string) => ValidationTransformResult<T>;

export type ValidatedVariableInfo<T = string> =
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
