/**
 * Extract domain from URL, removing www prefix
 */
export function extractDomain(url: URL | string): string {
  try {
    const urlObj = typeof url === 'string' ? new URL(url) : url;
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return typeof url === 'string' ? url : url.toString();
  }
}

/**
 * Build a URL string from a URL object or string, optionally adding query string parameters
 * @param url URL object or string
 * @param queryString Optional query string parameters to add to the URL
 * @returns The final URL as a string
 */
export function buildUrlWithQuery(
  url: URL | string,
  queryString?: Record<string, boolean | number | string>
): URL {
  const urlObj: URL = typeof url === 'string' ? new URL(url) : url;
  if (queryString) {
    Object.entries(queryString).forEach(([key, value]) => {
      urlObj.searchParams.set(key, String(value));
    });
  }
  return urlObj;
}
