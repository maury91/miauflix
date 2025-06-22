export interface HttpVcrConfig {
  /** Mode can be "replay" (use always cache), "record" (always record), "hybrid" (use cache if available, otherwise record), "migrate" (hybrid + transform unmigrated fixtures), or "disabled" (don't use caching) */
  mode: 'disabled' | 'hybrid' | 'migrate' | 'record' | 'replay';
  /** Directory to store fixtures */
  fixturesDir: string;
  /** URL patterns to include in recording/replay (if empty, all URLs are included) */
  includePatterns: string[];
  /** URL patterns to exclude from recording/replay */
  excludePatterns: string[];
  /** Map of URL patterns to provider names for organizing fixtures */
  providerMap: Array<{ pattern: string; name: string }>;
  /** Default provider name if no match is found */
  defaultProvider: string;
  /** List of HTTP headers that should not be recorded in fixtures */
  headersBlacklist: string[];
  /** Whether to pretty print the JSON in fixture files */
  prettyPrintJson: boolean;
  /** Transformers to apply to responses based on URL pattern */
  transformers: Array<{
    /** URL pattern to match (regex as string) */
    urlPattern: string;
    /** Function to transform response data */
    transform: (data: unknown) => unknown;
  }>;
  /** Auto-transform fixtures on load (when in hybrid mode) */
  autoTransform: boolean;
}

export interface StoredResponse {
  /** Status code of the response */
  status: number;
  /** Status text of the response */
  statusText: string;
  /** Headers of the response */
  headers: Record<string, string>;
  /** Body can be string or parsed JSON object depending on the content-type */
  body: unknown;
  /** Indicates if body has been parsed as JSON */
  bodyIsJson?: boolean;
  /** Indicates if the response has been transformed */
  isTransformed?: boolean;
}
