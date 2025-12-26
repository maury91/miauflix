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
