import type { ConfigEntryView } from '@miauflix/backend';
import { describe, expect, it } from 'vitest';

import { hasConfigurationIssue } from './useAppState';

const entry = (overrides: Partial<ConfigEntryView> = {}): ConfigEntryView => ({
  key: 'TMDB_API_KEY',
  value: '',
  isSecret: true,
  serviceGroup: 'TMDB',
  serviceDescription: 'The Movie Database integration',
  description: 'TMDB API key',
  required: true,
  hasValue: false,
  ...overrides,
});

describe('hasConfigurationIssue', () => {
  it('requires the configuration wizard for a missing required value', () => {
    expect(hasConfigurationIssue([entry()], { TMDB: { status: 'ready' } })).toBe(true);
  });

  it.each(['needs_configuration', 'degraded', 'error'])(
    'requires the configuration wizard for a %s service',
    status => {
      expect(hasConfigurationIssue([entry({ hasValue: true })], { TMDB: { status } })).toBe(true);
    }
  );

  it('does not require the wizard for configured, ready services', () => {
    expect(hasConfigurationIssue([entry({ hasValue: true })], { TMDB: { status: 'ready' } })).toBe(
      false
    );
  });
});
