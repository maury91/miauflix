/** The message the backend sent with a failed request, or the fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: unknown } | undefined)?.data;
  return typeof data === 'string' && data ? data : fallback;
}
