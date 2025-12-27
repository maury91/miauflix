/**
 * Convert BodyInit to string representation
 * @param body BodyInit to convert (string, URLSearchParams, FormData, etc.)
 * @returns String representation of the body. Returns empty string for null/undefined, files, or unsupported types.
 */
export function bodyInitToString(body: BodyInit | null | undefined): string {
  if (!body) {
    return '';
  }

  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (body instanceof FormData) {
    // Convert FormData to URL-encoded string, skipping file entries
    const formDataEntries: string[] = [];
    for (const [key, value] of body.entries()) {
      // Skip File entries (FormDataEntryValue is string | File)
      if (value instanceof File) {
        continue;
      }
      formDataEntries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
    return formDataEntries.join('&');
  }

  return '';
}

/**
 * Parse response body based on content-type, with fallback to text
 */
export async function parseResponseBody<T>(response: Response): Promise<T | string> {
  const contentType = response.headers.get('content-type');
  try {
    if (!contentType || contentType.toLowerCase().includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  } catch {
    return await response.text();
  }
}

/**
 * Normalize headers to lowercase keys in a Record<string, string>
 */
export function normalizeHeaders(
  headers: Headers | Record<string, string>
): Record<string, string> {
  if (headers instanceof Headers) {
    return Object.fromEntries(
      [...headers.entries()].map(([key, value]) => [key.toLowerCase(), value])
    );
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
}
