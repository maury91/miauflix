import type { ConfigEntryView } from '@miauflix/backend';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useConfigForm } from './useConfigForm';

const entry = (overrides: Partial<ConfigEntryView>): ConfigEntryView => ({
  key: 'KEY',
  value: 'stored',
  isSecret: false,
  serviceGroup: 'SERVICE',
  serviceDescription: 'Service description',
  description: 'Description',
  required: false,
  hasValue: true,
  inputType: 'text',
  ...overrides,
});

describe('useConfigForm', () => {
  it('hydrates values when configuration arrives after the first render', () => {
    const { result, rerender } = renderHook(
      ({ entries }: { entries: ConfigEntryView[] }) => useConfigForm(entries),
      { initialProps: { entries: [] } }
    );

    rerender({ entries: [entry({ key: 'URL', value: 'https://example.com' })] });

    expect(result.current.values.URL).toBe('https://example.com');
  });

  it('builds service payloads without blank configured secrets and clears saved dirty state', () => {
    const entries = [
      entry({ key: 'URL', value: 'https://old.example.com' }),
      entry({ key: 'TOKEN', value: 'abcd****', isSecret: true }),
    ];
    const { result } = renderHook(() => useConfigForm(entries));

    act(() => result.current.handleChange('URL', 'https://new.example.com'));
    expect(result.current.getServiceEntries('SERVICE')).toEqual([
      { key: 'URL', value: 'https://new.example.com' },
    ]);
    expect(result.current.dirtyServices.has('SERVICE')).toBe(true);

    act(() => result.current.handleChange('TOKEN', 'new-secret'));
    expect(result.current.getServiceEntries('SERVICE')).toContainEqual({
      key: 'TOKEN',
      value: 'new-secret',
    });

    act(() => result.current.markServiceSaved('SERVICE'));
    expect(result.current.dirtyServices.has('SERVICE')).toBe(false);
    expect(result.current.values.TOKEN).toBe('');
  });
});
