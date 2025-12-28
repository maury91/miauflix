import { logger } from '@logger';
import type { Cache } from 'cache-manager';
import { type HTMLElement, parse } from 'node-html-parser';

import type { RequestService } from '@services/request/request.service';

// Fallback hardcoded list if discovery fails
const FALLBACK_DOMAINS = ['yts.lt', 'yts.gg', 'yts.am', 'yts.ag'];

// Cache key for discovered domains
const CACHE_KEY = 'yts:mirrors:discovered';

// Cache TTL: 1 hour (3600 seconds)
const CACHE_TTL_MS = 3600 * 1000;

/**
 * Discover operational YTS domains from yifystatus.com
 * @param cache Cache instance for storing discovered domains
 * @param requestService RequestService instance for making HTTP requests
 * @returns Array of lowercase domain names (e.g., ['yts.lt', 'yts.gg', 'yts.am', 'yts.ag'])
 */
export async function discoverYTSMirrors(
  cache: Cache,
  requestService: RequestService
): Promise<string[]> {
  // Check cache first
  try {
    const cached = await cache.get<string[]>(CACHE_KEY);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      logger.debug('YTS', 'Using cached mirror domains');
      return cached;
    }
  } catch (error) {
    logger.warn('YTS', 'Failed to read from cache, will fetch fresh domains', error);
  }

  try {
    logger.debug('YTS', 'Fetching mirror domains from yifystatus.com');
    const response = await requestService.request<string>('https://yifystatus.com/', {
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch yifystatus.com: ${response.status} ${response.statusText}`);
    }

    const html = response.body;
    const domains = parseDomainsFromHTML(html);

    if (domains.length === 0) {
      logger.warn('YTS', 'No operational domains found, using fallback list');
      return FALLBACK_DOMAINS;
    }

    // Cache the discovered domains
    try {
      await cache.set(CACHE_KEY, domains, CACHE_TTL_MS);
      logger.debug(
        'YTS',
        `Discovered ${domains.length} operational domains: ${domains.join(', ')}`
      );
    } catch (cacheError) {
      logger.warn('YTS', 'Failed to cache discovered domains', cacheError);
    }

    return domains;
  } catch (error) {
    logger.warn(
      'YTS',
      'Failed to discover mirrors from yifystatus.com, using fallback list',
      error
    );
    return FALLBACK_DOMAINS;
  }
}

/**
 * Parse operational YTS domains from yifystatus.com HTML
 * @param html HTML content from yifystatus.com
 * @returns Array of lowercase domain names
 */
function parseDomainsFromHTML(html: string): string[] {
  const domains: string[] = [];

  try {
    const root = parse(html);

    // Find header containing "official" (case-insensitive)
    const headings = root.querySelectorAll('h2');
    const officialHeading = headings.find(h => h.text.trim().toLowerCase().includes('official'));

    if (!officialHeading) {
      logger.warn('YTS', 'Could not find "Official" heading in HTML');
      return domains;
    }

    // Navigate up to find the parent section/group
    let section: HTMLElement | null = null;
    let current: HTMLElement | null = officialHeading.parentNode as HTMLElement | null;

    while (current) {
      // Look for section or element with serviceGroup class
      if (
        current.tagName === 'SECTION' ||
        (current.classList && current.classList.contains('serviceGroup'))
      ) {
        section = current;
        break;
      }
      current = current.parentNode;
    }

    if (!section) {
      logger.warn('YTS', 'Could not find parent section for "Official" heading');
      return domains;
    }

    // Find all links in the section
    const links = section.querySelectorAll('a');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) {
        continue;
      }

      // Extract domain from URL (e.g., "https://yts.lt" -> "yts.lt")
      try {
        const url = new URL(href);
        const domain = url.hostname.toLowerCase();
        if (!domains.includes(domain)) {
          domains.push(domain);
        }
      } catch {
        // Invalid URL, skip
        continue;
      }
    }

    return domains;
  } catch (error) {
    logger.error('YTS', 'Error parsing HTML for domains', error);
    return domains;
  }
}
