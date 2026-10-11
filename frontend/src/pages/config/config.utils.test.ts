import type { ConfigEntryView } from '@miauflix/backend';
import { describe, expect, it } from 'vitest';

import { preserveInitialServiceOrder, sortServiceGroups } from './config.utils';

const entry = (required: boolean, hasValue: boolean): ConfigEntryView => ({
  key: 'KEY',
  value: '',
  isSecret: false,
  serviceGroup: 'SERVICE',
  serviceDescription: 'Service description',
  description: 'Description',
  required,
  hasValue,
  inputType: 'text',
});

describe('sortServiceGroups', () => {
  it('places groups with missing required values first and alphabetizes each section', () => {
    const groups = sortServiceGroups({
      Zulu: [entry(false, true)],
      Bravo: [entry(true, false)],
      Alpha: [entry(true, false)],
      Echo: [entry(false, true)],
    });

    expect(groups.map(([name]) => name)).toEqual(['Alpha', 'Bravo', 'Echo', 'Zulu']);
  });

  it('places degraded services after missing configuration and before ready services', () => {
    const groups = sortServiceGroups(
      {
        READY: [entry(false, true)],
        DEGRADED: [entry(false, true)],
        MISSING: [entry(true, false)],
      },
      { DEGRADED: { status: 'degraded', reason: 'all mirrors unavailable' } }
    );

    expect(groups.map(([name]) => name)).toEqual(['MISSING', 'DEGRADED', 'READY']);
  });

  it('orders remote-reported missing values before other degraded services', () => {
    const groups = sortServiceGroups(
      {
        READY: [entry(false, true)],
        CATALOG: [entry(true, true)],
        DEGRADED: [entry(false, true)],
      },
      {
        CATALOG: { status: 'degraded', missingVars: ['TMDB_API_ACCESS_TOKEN'] },
        DEGRADED: { status: 'degraded', reason: 'temporary provider failure' },
      }
    );

    expect(groups.map(([name]) => name)).toEqual(['CATALOG', 'DEGRADED', 'READY']);
  });
});

describe('preserveInitialServiceOrder', () => {
  it('keeps the first-render order when service configuration changes', () => {
    const initiallySorted = sortServiceGroups({
      CATALOG: [entry(true, false)],
      LIST: [entry(true, false)],
      SERVER: [entry(false, true)],
    });
    const afterSave = sortServiceGroups({
      CATALOG: [entry(true, true)],
      LIST: [entry(true, false)],
      SERVER: [entry(false, true)],
    });

    expect(
      preserveInitialServiceOrder(
        afterSave,
        initiallySorted.map(([name]) => name)
      ).map(([name]) => name)
    ).toEqual(['CATALOG', 'LIST', 'SERVER']);
  });
});
