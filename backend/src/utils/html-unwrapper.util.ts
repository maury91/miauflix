import { logger } from '@logger';
import { parse } from 'node-html-parser';

/**
 * Extract JSON from HTML-wrapped responses (e.g., FlareSolverr responses)
 * Looks for JSON in <pre> tags or tries to parse the entire response as JSON
 */
export function unwrapJsonFromHtml(html: string): string {
  try {
    // First, try to parse as JSON directly (in case it's already unwrapped)
    JSON.parse(html);
    return html;
  } catch {
    // Not JSON, continue with HTML parsing
  }

  try {
    const root = parse(html);

    // Look for <pre> tags containing JSON
    const preTags = root.querySelectorAll('pre');
    for (const pre of preTags) {
      const text = pre.text.trim();
      if (text.startsWith('{') || text.startsWith('[')) {
        try {
          // Validate it's valid JSON
          JSON.parse(text);
          logger.debug('HTMLUnwrapper', 'Found JSON in <pre> tag');
          return text;
        } catch {
          // Not valid JSON, continue
        }
      }
    }

    // Look for JSON in script tags with type="application/json"
    const jsonScripts = root.querySelectorAll('script[type="application/json"]');
    for (const script of jsonScripts) {
      const text = script.text.trim();
      if (text) {
        try {
          JSON.parse(text);
          logger.debug('HTMLUnwrapper', 'Found JSON in script tag');
          return text;
        } catch {
          // Not valid JSON, continue
        }
      }
    }

    // Try to extract JSON from the body text directly
    const body = root.querySelector('body');
    if (body) {
      const bodyText = body.text.trim();
      // Look for JSON-like patterns
      const jsonMatch = bodyText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        try {
          JSON.parse(jsonMatch[1]);
          logger.debug('HTMLUnwrapper', 'Found JSON in body text');
          return jsonMatch[1];
        } catch {
          // Not valid JSON, continue
        }
      }
    }

    logger.warn('HTMLUnwrapper', 'Could not extract JSON from HTML, returning original');
    return html;
  } catch (error) {
    logger.error('HTMLUnwrapper', 'Error parsing HTML:', error);
    return html;
  }
}

/**
 * Check if a string appears to be HTML-wrapped JSON
 */
export function isHtmlWrappedJson(text: string): boolean {
  const trimmed = text.trim();
  // Check if it starts with HTML tags but contains JSON-like content
  return (
    (trimmed.startsWith('<') || trimmed.includes('</')) &&
    (trimmed.includes('{') || trimmed.includes('[')) &&
    (trimmed.includes('</pre>') || trimmed.includes('<pre>') || trimmed.includes('<script'))
  );
}
