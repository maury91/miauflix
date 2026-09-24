import type { ConfigEntryView } from '@miauflix/backend';
import { describe, expect, it } from 'vitest';

import { hasConfigurationIssue } from './useAppState';

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

  it.each(['needs_configuration', 'degraded', 'error'])(
    'requires the configuration wizard for a %s service',
    status => {
      expect(hasConfigurationIssue([entry({ hasValue: true })], { CATALOG: { status } })).toBe(
        true
      );
    }
  );

  it('does not require the wizard for configured, ready services', () => {
    expect(
      hasConfigurationIssue([entry({ hasValue: true })], { CATALOG: { status: 'ready' } })
    ).toBe(false);
  });
});
