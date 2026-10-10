import type { ConfigEntryView } from '@miauflix/backend';
import { describe, expect, it } from 'vitest';

import { getConfigurationPageState, hasConfigurationIssue } from './useAppState';

const entry = (overrides: Partial<ConfigEntryView> = {}): ConfigEntryView => ({
  key: 'CATALOG_TOKEN',
  value: '',
  isSecret: true,
  serviceGroup: 'CATALOG',
  serviceDescription: 'The Movie Database integration',
  description: 'Catalog token',
  required: true,
  hasValue: false,
  ...overrides,
});

describe('hasConfigurationIssue', () => {
  it('requires the configuration wizard for a missing required value', () => {
    expect(hasConfigurationIssue([entry()], { CATALOG: { status: 'error' } })).toBe(true);
  });

  it('prompts for backend-owned required values even when a remote reports ready', () => {
    expect(hasConfigurationIssue([entry()], { CATALOG: { status: 'ready' } })).toBe(true);
  });

  it('requires the configuration wizard for a needs_configuration service', () => {
    expect(
      hasConfigurationIssue([entry({ hasValue: true })], {
        CATALOG: { status: 'needs_configuration' },
      })
    ).toBe(true);
  });

  it('treats missing variables on a degraded service as configuration issues', () => {
    expect(
      hasConfigurationIssue([entry({ hasValue: true })], {
        CATALOG: { status: 'degraded', missingVars: ['CATALOG_TOKEN'] },
      })
    ).toBe(true);
  });

  it.each(['degraded', 'error'])(
    'does not require the configuration wizard for a runtime %s service',
    status => {
      expect(hasConfigurationIssue([entry({ hasValue: true })], { CATALOG: { status } })).toBe(
        false
      );
    }
  );

  it('does not require the wizard for configured, ready services', () => {
    expect(
      hasConfigurationIssue([entry({ hasValue: true })], { CATALOG: { status: 'ready' } })
    ).toBe(false);
  });
});

describe('getConfigurationPageState', () => {
  it('keeps the required configuration wizard open when required values are missing', () => {
    expect(getConfigurationPageState([entry()], { CATALOG: { status: 'degraded' } }, true)).toBe(
      'config_wizard'
    );
  });

  it('opens the wizard from service-reported missing variables even when config data is absent', () => {
    expect(
      getConfigurationPageState(
        undefined,
        {
          CATALOG: { status: 'degraded', missingVars: ['CATALOG_TOKEN'] },
        },
        true
      )
    ).toBe('config_wizard');
  });

  it('does not force the wizard for a degraded service with no missing configuration', () => {
    expect(
      getConfigurationPageState(
        [entry({ hasValue: true })],
        {
          CATALOG: { status: 'degraded', reason: 'provider temporarily unavailable' },
        },
        false
      )
    ).toBe(null);
  });
});
