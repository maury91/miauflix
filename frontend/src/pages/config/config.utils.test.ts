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
