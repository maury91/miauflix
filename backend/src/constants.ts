import type { Variables } from './configuration';
import { variablesDefaultValues } from './configuration';

export const ENV = (variable: Variables): string =>
  process.env[variable] ?? variablesDefaultValues[variable] ?? '';

ENV.number = (variable: Variables): number => parseInt(ENV(variable), 10) || 0;
ENV.boolean = (variable: Variables): boolean => ENV(variable).toLowerCase() === 'true';
