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
  defaultValue: string;
  password?: false;
  skipUserInteraction?: boolean;
};

type SkipUserInteractionVariableInfo = BaseVariableInfo & {
  skipUserInteraction: true;
  defaultValue: string;
  password?: false;
};

export type VariableInfo =
  | PasswordVariableInfo
  | DefaultVariableInfo
  | SkipUserInteractionVariableInfo
  | BaseVariableInfo;

export type ServiceVariables = Record<string, VariableInfo>;

export type ServiceConfiguration = {
  name: string;
  description: string;
  variables: ServiceVariables;
  test: () => Promise<void>;
};
