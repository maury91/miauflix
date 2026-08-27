/**
 * Detects if a value matches the backend's masking format.
 * Backend maskValue(): '****' for empty/short, 'abcd****' for longer values.
 */
export function isMaskedValue(value: string): boolean {
  return value === '****' || /^.{1,4}\*{4}$/.test(value);
}
