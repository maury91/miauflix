/**
 * Safely parse JSON string, returning undefined on error
 */
export function tryParseJSON<T>(body: string): T | undefined {
  try {
    return JSON.parse(body) as T;
  } catch {
    return undefined;
  }
}
