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

type DefaultVariableInfo = BaseVariableInfo & {
  defaultValue: string | (() => string);
  password?: false;
  skipUserInteraction?: boolean;
};

type SkipUserInteractionVariableInfo = BaseVariableInfo & {
  skipUserInteraction: true;
  defaultValue: string | (() => string);
  password?: false;
};

export type VariableInfo =
  | BaseVariableInfo
  | DefaultVariableInfo
  | PasswordVariableInfo
  | SkipUserInteractionVariableInfo;

export type ServiceVariables<V extends string> = Record<V, VariableInfo>;

export type ServiceConfiguration<V extends string> = {
  name: string;
  description: string;
  variables: ServiceVariables<V>;
  test: () => Promise<void>;
};

export function serviceConfiguration<V extends string>(
  config: ServiceConfiguration<V>
): ServiceConfiguration<V> {
  return config;
}
