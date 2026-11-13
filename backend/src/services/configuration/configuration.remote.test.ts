import type { ServiceConfigSchema } from '@miauflix/contract';

import {
  buildServiceConfigSnapshot,
  isServiceVpnCheckKey,
  missingRemoteValues,
  remoteVariableInfo,
} from './configuration.remote';
import type { VariableName } from './configuration.types';

const schema: ServiceConfigSchema = {
  groups: [
    {
      id: 'SOURCES_PROVIDER',
      name: 'Sources provider',
      description: 'Provider settings',
      variables: [
        { key: 'SOURCES_TOKEN', description: 'Token', required: true, inputType: 'password' },
        {
          key: 'SOURCES_LIMIT',
          description: 'Limit',
          required: false,
          inputType: 'number',
          defaultValue: '5',
        },
        {
          key: 'SOURCES_DISABLE_VPN_CHECK',
          description: 'VPN check',
          required: false,
          inputType: 'boolean',
        },
      ],
    },
  ],
};

const raw = (entries: Record<string, string>) =>
  new Map(Object.entries(entries)) as unknown as ReadonlyMap<VariableName, string>;

describe('isServiceVpnCheckKey', () => {
  it('matches per-service VPN opt-outs but not the deployment-wide one', () => {
    expect(isServiceVpnCheckKey('SOURCES_DISABLE_VPN_CHECK')).toBe(true);
    expect(isServiceVpnCheckKey('DISABLE_VPN_CHECK')).toBe(false);
    expect(isServiceVpnCheckKey('SOURCES_TOKEN')).toBe(false);
  });
});

describe('remoteVariableInfo', () => {
  it('maps a password variable to a secret without a transform', () => {
    const info = remoteVariableInfo(schema.groups[0].variables[0]);
    expect(info).toMatchObject({ password: true, required: true });
    expect('transform' in info && info.transform).toBeFalsy();
  });

  it('maps a number variable to a number transform with its default', () => {
    const info = remoteVariableInfo(schema.groups[0].variables[1]);
    expect(info).toMatchObject({ defaultValue: '5' });
    expect('transform' in info && info.transform?.('7')).toMatchObject({ isValid: true, value: 7 });
    expect('transform' in info && info.transform?.('abc')).toMatchObject({ isValid: false });
  });
});

describe('buildServiceConfigSnapshot', () => {
  it('prefers overrides, then stored values, then schema defaults', () => {
    expect(
      buildServiceConfigSnapshot(schema, raw({ SOURCES_TOKEN: 'stored', SOURCES_LIMIT: '9' }), {
        SOURCES_LIMIT: '3',
      })
    ).toEqual({ SOURCES_TOKEN: 'stored', SOURCES_LIMIT: '3', SOURCES_DISABLE_VPN_CHECK: 'false' });
  });

  it('makes an unset service VPN check follow DISABLE_VPN_CHECK', () => {
    expect(
      buildServiceConfigSnapshot(schema, raw({ SOURCES_TOKEN: 't', DISABLE_VPN_CHECK: 'true' }))
    ).toMatchObject({ SOURCES_DISABLE_VPN_CHECK: 'true' });
    expect(
      buildServiceConfigSnapshot(schema, raw({ SOURCES_TOKEN: 't', DISABLE_VPN_CHECK: 'true' }), {
        DISABLE_VPN_CHECK: 'false',
      })
    ).toMatchObject({ SOURCES_DISABLE_VPN_CHECK: 'false' });
  });

  it('returns undefined while a required value is missing', () => {
    expect(buildServiceConfigSnapshot(schema, raw({}))).toBeUndefined();
  });
});

describe('missingRemoteValues', () => {
  it('lists required keys with no override, stored value or default', () => {
    expect(missingRemoteValues(schema, raw({}), {})).toEqual(['SOURCES_TOKEN']);
    expect(missingRemoteValues(schema, raw({}), { SOURCES_TOKEN: 't' })).toEqual([]);
  });
});
