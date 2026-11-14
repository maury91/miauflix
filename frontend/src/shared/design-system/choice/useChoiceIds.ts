import { useId } from 'react';

/** IDs for a choice's description and error, joined for `aria-describedby`. */
export function useChoiceIds(description: unknown, error: unknown) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  return { labelId: `${id}-label`, descriptionId, errorId, describedBy };
}
