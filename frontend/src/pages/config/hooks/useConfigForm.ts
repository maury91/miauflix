import type { ConfigEntryView } from '@miauflix/backend';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface FormValues {
  [key: string]: string;
}

function suggestedValue(entry: ConfigEntryView): string {
  if (entry.value) return entry.value;
  if (entry.defaultValueSource === 'browser-origin' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return entry.isSecret ? '' : entry.value;
}

export function useConfigForm(entries: ConfigEntryView[]) {
  const initialValues = useMemo<FormValues>(() => {
    const result: FormValues = {};
    for (const entry of entries) {
      result[entry.key] = entry.isSecret ? '' : suggestedValue(entry);
    }
    return result;
  }, [entries]);

  const initialDirtyFields = useMemo(
    () =>
      new Set(
        entries
          .filter(entry => entry.defaultValueSource === 'browser-origin' && !entry.value)
          .map(entry => entry.key)
      ),
    [entries]
  );

  const [values, setValues] = useState<FormValues>(initialValues);
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(initialDirtyFields);

  useEffect(() => {
    if (initialDirtyFields.size === 0) return;
    setDirtyFields(current => {
      const next = new Set(current);
      let changed = false;
      for (const key of initialDirtyFields) {
        if (next.has(key)) continue;
        next.add(key);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [initialDirtyFields]);

  useEffect(() => {
    setValues(current => {
      const next: FormValues = {};
      let changed = false;
      for (const entry of entries) {
        const nextValue = dirtyFields.has(entry.key)
          ? (current[entry.key] ?? '')
          : entry.isSecret
            ? ''
            : suggestedValue(entry);
        next[entry.key] = nextValue;
        if (current[entry.key] !== nextValue) changed = true;
      }
      if (Object.keys(current).length !== Object.keys(next).length) changed = true;
      return changed ? next : current;
    });
  }, [entries, dirtyFields]);

  const handleChange = useCallback((key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setDirtyFields(prev => new Set(prev).add(key));
  }, []);

  const getSubmittableEntries = useCallback((): { key: string; value: string }[] => {
    return entries
      .filter(entry => {
        const value = values[entry.key] ?? '';
        if (entry.isSecret) {
          // For secrets: only include if the user typed something non-empty
          return value.trim().length > 0;
        }
        // For non-secrets: only include if dirty
        return dirtyFields.has(entry.key);
      })
      .map(entry => ({ key: entry.key, value: values[entry.key] ?? '' }));
  }, [entries, values, dirtyFields]);

  const getServiceEntries = useCallback(
    (serviceGroup: string): { key: string; value: string }[] =>
      entries
        .filter(entry => entry.serviceGroup === serviceGroup)
        .filter(entry => !entry.isSecret || (values[entry.key] ?? '').trim().length > 0)
        .map(entry => ({ key: entry.key, value: values[entry.key] ?? '' })),
    [entries, values]
  );

  const dirtyServices = useMemo(
    () =>
      new Set(entries.filter(entry => dirtyFields.has(entry.key)).map(entry => entry.serviceGroup)),
    [dirtyFields, entries]
  );

  const markServiceSaved = useCallback(
    (serviceGroup: string) => {
      const serviceEntries = entries.filter(entry => entry.serviceGroup === serviceGroup);
      const serviceKeys = new Set(serviceEntries.map(entry => entry.key));
      setDirtyFields(current => new Set([...current].filter(key => !serviceKeys.has(key))));
      setValues(current => {
        const next = { ...current };
        for (const entry of serviceEntries) {
          if (entry.isSecret) next[entry.key] = '';
        }
        return next;
      });
    },
    [entries]
  );

  const reset = useCallback(() => {
    setValues(initialValues);
    setDirtyFields(initialDirtyFields);
  }, [initialDirtyFields, initialValues]);

  return {
    values,
    dirtyServices,
    handleChange,
    getSubmittableEntries,
    getServiceEntries,
    markServiceSaved,
    reset,
  };
}
