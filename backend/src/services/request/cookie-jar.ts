import type { CookiePair } from '@mytypes/flaresolverr.types';

/**
 * Simple per-domain cookie jar for request management.
 */
export class CookieJar {
  private jar: Map<string, Map<string, string>> = new Map();

  /**
   * Get serialized cookie header string for the given domain.
   */
  getCookieHeader(domain: string): string {
    const domainCookies = this.jar.get(domain);
    if (!domainCookies) return '';
    return Array.from(domainCookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  /**
   * Get cookies for a domain as CookiePair array.
   */
  getCookiePairs(domain: string): CookiePair[] {
    const domainCookies = this.jar.get(domain);
    if (!domainCookies) return [];
    return Array.from(domainCookies.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  }

  /**
   * Check if a cookie exists for a domain.
   */
  hasCookie(domain: string, cookieName: string): boolean {
    const domainCookies = this.jar.get(domain);
    if (!domainCookies) return false;
    return domainCookies.has(cookieName);
  }

  /**
   * Update the cookie jar for a domain from a Set-Cookie header(s).
   */
  setCookies(domain: string, setCookieHeaders: string[] | string) {
    if (!setCookieHeaders) return;
    const domainCookies =
      this.jar.get(domain) ??
      ((): Map<string, string> => {
        const map = new Map<string, string>();
        this.jar.set(domain, map);
        return map;
      })();

    const headerArr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

    headerArr.forEach(cookieStr => {
      const [cookiePair] = cookieStr.split(';');
      const [name, ...valueParts] = cookiePair.split('=');
      const trimmedName = name?.trim();
      if (trimmedName && valueParts.length) {
        domainCookies.set(trimmedName, valueParts.join('=').trim());
      }
    });
  }

  /**
   * Delete all cookies for a domain.
   */
  clear(domain: string) {
    this.jar.delete(domain);
  }

  /**
   * Delete all cookies in the jar (all domains).
   */
  clearAll() {
    this.jar.clear();
  }
}
