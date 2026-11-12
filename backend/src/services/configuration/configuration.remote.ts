import type { ConfigVariable, ServiceConfigSchema } from '@miauflix/contract';

import type { VariableInfo } from '@mytypes/configuration';
import { transforms, variable } from '@utils/config';

import type { VariableName } from './configuration.types';

/** A remote service's own VPN opt-out, which defaults to the deployment-wide DISABLE_VPN_CHECK. */
export const isServiceVpnCheckKey = (key: string): boolean =>
  key !== 'DISABLE_VPN_CHECK' && key.endsWith('_DISABLE_VPN_CHECK');

/** Converts a variable published in a remote service's schema into local variable metadata. */
export function remoteVariableInfo(item: ConfigVariable): VariableInfo {
  const common = {
    description: item.description,
    label: item.label,
    required: item.required,
    advanced: item.advanced,
    defaultValueSource: item.defaultValueSource,
    example: item.example,
    link: item.link,
    linkLabel: item.linkLabel,
    testRelevant: item.testRelevant,
    testFailureHelp: item.testFailureHelp,
    booleanStateDescriptions: item.booleanStateDescriptions,
  };
  switch (item.inputType) {
    case 'password':
      return item.skipUserInteraction && item.defaultValue
        ? variable({
            ...common,
            password: true,
            defaultValue: item.defaultValue,
            skipUserInteraction: true,
          })
        : variable({ ...common, password: true });
    case 'select':
      return variable({
        ...common,
        defaultValue: item.defaultValue,
        options: item.options ?? {},
        transform: transforms.enum({ values: Object.keys(item.options ?? {}) }),
      });
    case 'boolean':
      return variable({
        ...common,
        defaultValue: item.defaultValue ?? 'false',
        transform: transforms.boolean(),
      });
    case 'number':
      return variable({
        ...common,
        defaultValue: item.defaultValue ?? '0',
        transform: transforms.number(item.numberOptions ?? {}),
      });
    default:
      return variable({
        ...common,
        defaultValue: item.defaultValue ?? '',
        transform: transforms.string(),
      });
  }
}

/**
 * The full set of values a remote service needs, as sent to it. `overrides` (a draft) win over
 * stored values, which win over schema defaults. An unset per-service VPN check follows
 * DISABLE_VPN_CHECK. Returns undefined while a required value is missing.
 */
export function buildServiceConfigSnapshot(
  schema: ServiceConfigSchema,
  rawValues: ReadonlyMap<VariableName, string>,
  overrides: Record<string, string> = {}
): Record<string, string> | undefined {
  const variables = schema.groups.flatMap(group => group.variables);
  const values = Object.fromEntries(
    variables.map(item => {
      const own = overrides[item.key] ?? rawValues.get(item.key as VariableName);
      if (isServiceVpnCheckKey(item.key) && !own)
        return [
          item.key,
          overrides.DISABLE_VPN_CHECK ||
            rawValues.get('DISABLE_VPN_CHECK') ||
            item.defaultValue ||
            'false',
        ];
      return [item.key, own ?? item.defaultValue ?? ''];
    })
  );
  if (variables.some(item => item.required && !values[item.key])) return undefined;
  return values;
}

/** Required keys of `schema` that have no override, stored value, or default. */
export function missingRemoteValues(
  schema: ServiceConfigSchema,
  rawValues: ReadonlyMap<VariableName, string>,
  overrides: Record<string, string>
): string[] {
  return schema.groups.flatMap(candidate =>
    candidate.variables
      .filter(
        item =>
          item.required &&
          !(overrides[item.key] ?? rawValues.get(item.key as VariableName) ?? item.defaultValue)
      )
      .map(item => item.key)
  );
}
