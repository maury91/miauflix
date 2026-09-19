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
  it('places incomplete services first and alphabetizes both sections', () => {
    const groups = sortServiceGroups({
      Zulu: [entry(false, true)],
      Bravo: [entry(true, false)],
      Alpha: [entry(true, false)],
      Echo: [entry(false, true)],
    });

    expect(groups.map(([name]) => name)).toEqual(['Alpha', 'Bravo', 'Echo', 'Zulu']);
  });

  it('puts services with an unhealthy status before healthy services', () => {
    const groups = sortServiceGroups(
      {
        TRAKT: [entry(false, true)],
        CATALOG: [entry(false, true)],
      },
      { CATALOG: { status: 'error' }, TRAKT: { status: 'ready' } }
    );

    expect(groups.map(([service]) => service)).toEqual(['CATALOG', 'TRAKT']);
  });

  it('prioritizes broken services over services with missing values', () => {
    const groups = sortServiceGroups(
      {
        TRAKT: [entry(true, false)],
        CATALOG: [entry(true, true)],
      },
      { CATALOG: { status: 'error' }, TRAKT: { status: 'needs_configuration' } }
    );

    expect(groups.map(([service]) => service)).toEqual(['CATALOG', 'TRAKT']);
  });
});

describe('preserveInitialServiceOrder', () => {
  it('keeps the first-render order when service configuration changes', () => {
    const initiallySorted = sortServiceGroups({
      CATALOG: [entry(true, false)],
      TRAKT: [entry(true, false)],
      SERVER: [entry(false, true)],
    });
    const afterSave = sortServiceGroups({
      CATALOG: [entry(true, true)],
      TRAKT: [entry(true, false)],
      SERVER: [entry(false, true)],
    });

    expect(
      preserveInitialServiceOrder(
        afterSave,
        initiallySorted.map(([name]) => name)
      ).map(([name]) => name)
    ).toEqual(['CATALOG', 'TRAKT', 'SERVER']);
  });
});
