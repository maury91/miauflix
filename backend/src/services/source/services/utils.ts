const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
];

export const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

export const enhancedFetch = async (
  url: URL | string,
  options: RequestInit = {},
  timeout?: number
) => {
  const { headers = {}, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8,it;q=0.7,pl;q=0.6,lt;q=0.5', // Default accept language
        priority: 'u=0, i', // Default priority
        referer: new URL(url).origin + '/', // Default referer
        ['user-agent']: getRandomUserAgent(), // Default user agent
        ...headers,
      },
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    throw error;
  }
};

export class ErrorWithStatus extends Error {
  constructor(
    message: string,
    public status: string
  ) {
    super(message);
    this.name = 'ErrorWithStatus';
  }
}
