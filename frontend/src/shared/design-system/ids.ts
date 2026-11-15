/** Joins ID references (`aria-describedby`, `aria-labelledby`), skipping empty ones. */
export const joinIds = (...ids: (string | false | null | undefined)[]) =>
  ids.filter(Boolean).join(' ') || undefined;
