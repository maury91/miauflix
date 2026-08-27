import type { ConfigEntryView } from '@miauflix/backend';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface FormValues {
  [key: string]: string;
}

export function useConfigForm(entries: ConfigEntryView[]) {
  // Secrets start empty so the user can type a new value; non-secrets start with their current value
  const initialValues = useMemo<FormValues>(() => {
    const result: FormValues = {};
    for (const entry of entries) {
      result[entry.key] = entry.isSecret ? '' : entry.value;
    }
    return result;
  }, [entries]);

  const [values, setValues] = useState<FormValues>(initialValues);
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    setValues(current => {
      const next: FormValues = {};
      for (const entry of entries) {
        next[entry.key] = dirtyFields.has(entry.key)
          ? (current[entry.key] ?? '')
          : entry.isSecret
            ? ''
            : entry.value;
      }
      return next;
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
    setDirtyFields(new Set());
  }, [initialValues]);

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
