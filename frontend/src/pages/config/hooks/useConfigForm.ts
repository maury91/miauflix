import type { ConfigEntryView } from '@miauflix/backend';
import { useCallback, useMemo, useState } from 'react';

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

  const reset = useCallback(() => {
    setValues(initialValues);
    setDirtyFields(new Set());
  }, [initialValues]);

  return { values, handleChange, getSubmittableEntries, reset };
}
