type BaseVariableInfo = {
  description: string;
  example?: string;
  link?: string;
  required: boolean;
};

type PasswordVariableInfo = BaseVariableInfo & {
  password: true;
};

type DefaultVariableInfo = BaseVariableInfo & {
  defaultValue: string;
  password?: false;
};

export type VariableInfo =
  | PasswordVariableInfo
  | DefaultVariableInfo
  | BaseVariableInfo;

export type ServiceVariables = Record<string, VariableInfo>;

export type ServiceConfiguration = {
  name: string;
  description: string;
  variables: ServiceVariables;
  test: () => Promise<void>;
};
