import { sanitize } from './sanitize';
import { handleRequest } from './handleRequest';
import type {
  AnonymizedBy,
  HandleRequestParams,
  HandleRequestResponse,
  HttpMethod,
  MockResponseEnvelope,
} from './types';

const PORT = Number(process.env.MOCK_PORT || 80);
const DATA_DIR = process.env.DATA_DIR;
const API_KEY = process.env.API_KEY || '';
const API_SECRET = process.env.API_SECRET || '';
const API_BASE_URL = process.env.API_BASE_URL;
const API_HEADERS = process.env.API_HEADERS ? JSON.parse(process.env.API_HEADERS) : {};
const API_AUTH_HEADER = process.env.API_AUTH_HEADER || 'Authorization';
const API_AUTH_HEADER_IS_BEARER = process.env.API_AUTH_HEADER_IS_BEARER === 'true';
const RECORD_PROVIDER_FIXTURES = process.env.RECORD_PROVIDER_FIXTURES === 'true';
const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL;
// Recording mode is the explicit original-data path; ordinary generated writes are faker-backed.
const ANONYMIZED_BY: AnonymizedBy = RECORD_PROVIDER_FIXTURES ? false : 'faker';

// This params will be replaced with default values in the filename
// when saving/loading responses. This is to avoid data that changes based on time
const paramOverrides: Record<string, string> = {
  end_date: 'YYYY-MM-DD',
  start_date: 'YYYY-MM-DD',
};

// This header will be omitted from the response because they are known to cause problems
const headersToOmit = [
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'date',
  'via',
  'nel',
  'speculation-rules',
  'x-varnish',
  'x-frame-options',
  'x-content-type-options',
  'x-xss-protection',
  'x-powered-by',
  'x-request-id',
  'strict-transport-security',
  'server',
  'server-timing',
  'report-to',
  /^x-amz.*/,
  /^x-az.*/,
  /^x-azure.*/,
  /^x-aws.*/,
  /^cf.*/,
  /^x-cdn.*/,
  /^x-memc.*/,
  /^x-cache.*/,
  /^x-task.*/,
];

if (!DATA_DIR) {
  console.error('DATA_DIR environment variable is not set');
  process.exit(1);
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await Bun.file(dir).exists();
  } catch (error) {
    await Bun.write(Bun.file(`${dir}/.gitkeep`), '');
  }
}
function getFilePath(urlPath: string, queryParams: Record<string, string>, method: string): string {
  const sanitizedPath = urlPath.replace(/^\//, '');
  const processedParams = { ...queryParams };

  for (const [key, defaultValue] of Object.entries(paramOverrides)) {
    if (key in processedParams) {
      processedParams[key] = defaultValue;
    }
  }

  let queryString = '';
  if (processedParams && Object.keys(processedParams).length > 0) {
    const sortedKeys = Object.keys(processedParams).sort();
    queryString =
      '-' +
      sortedKeys
        .map(key => `${key}-${processedParams[key]}`)
        .join('-')
        .replace(/[\/\\?%*:|"<>]/g, '_'); // Replace invalid filename chars
  }

  // Include method in filename for non-GET requests
  const methodPrefix = method !== 'GET' ? `${method.toLowerCase()}-` : '';
  return `${DATA_DIR}/${methodPrefix}${sanitizedPath}${queryString}.json`;
}

function withImageBaseUrl(data: unknown): unknown {
  if (!IMAGE_BASE_URL || !data || typeof data !== 'object') return data;

  const configuration = data as { images?: Record<string, unknown> };
  if (!configuration.images) return data;

  return {
    ...configuration,
    images: {
      ...configuration.images,
      base_url: IMAGE_BASE_URL,
      secure_base_url: IMAGE_BASE_URL,
    },
  };
}

async function saveResponse<T>(filePath: string, response: MockResponseEnvelope<T>): Promise<void> {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  await ensureDir(dir);
  await Bun.write(filePath, JSON.stringify(response, null, 2));
}

function omitHeaders(headers: Headers): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const [key, value] of typeof headers.entries === 'function'
    ? headers.entries()
    : Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (
      !headersToOmit.some(pattern =>
        pattern instanceof RegExp ? pattern.test(lowerKey) : pattern === lowerKey
      )
    ) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function responseBodyForStatus(status: number, body: string): string | null {
  return status === 204 || status === 205 || status === 304 ? null : body;
}

async function defaultHandleRequest({
  req,
  path,
  queryParams,
  method,
  filePath,
}: HandleRequestParams): Promise<HandleRequestResponse> {
  if (method !== 'GET') {
    return {
      data: null,
      store: false,
      response: new Response('Method not supported', { status: 405 }),
    };
  }

  if (!API_KEY || !API_BASE_URL) {
    if (!API_KEY) {
      console.error('API Key is not configured');
    }
    if (!API_BASE_URL) {
      console.error('API Base URL is not configured');
    }
    return {
      data: null,
      store: false,
      response: new Response(
        JSON.stringify({
          error: 'This request is not cached and API_KEY or API_BASE_URL is not configured',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    };
  }

  if (!RECORD_PROVIDER_FIXTURES) {
    return {
      data: null,
      store: false,
      response: new Response(
        JSON.stringify({
          error: 'Fixture missing and recording is disabled',
          path,
          hint: 'Set RECORD_PROVIDER_FIXTURES=true for an explicit recording run',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    };
  }

  console.log(`Calling real API for ${filePath}`);

  const apiUrl = new URL(path, API_BASE_URL);
  for (const [key, value] of Object.entries(queryParams)) {
    apiUrl.searchParams.append(key, value);
  }

  // Make the request to API
  const incomingHeaders = Object.fromEntries(req.headers.entries());
  for (const header of [
    'host',
    'connection',
    'content-length',
    'transfer-encoding',
    'accept-encoding',
    'authorization',
    'trakt-api-key',
    API_AUTH_HEADER.toLowerCase(),
  ]) {
    delete incomingHeaders[header];
  }
  const apiResponse = await fetch(apiUrl.toString(), {
    headers: {
      ...incomingHeaders,
      ...API_HEADERS,
      [API_AUTH_HEADER]: API_AUTH_HEADER_IS_BEARER ? `Bearer ${API_KEY}` : API_KEY,
    },
  });

  if (!apiResponse.headers.get('content-type')?.includes('application/json')) {
    const body = await apiResponse.text();
    return {
      data: body,
      store: apiResponse.ok,
      response: new Response(responseBodyForStatus(apiResponse.status, body), {
        headers: omitHeaders(apiResponse.headers),
        status: apiResponse.status,
      }),
    };
  }

  const data = await apiResponse.json();

  // Apply sanitization
  const sanitizedData = sanitize(data, apiUrl.toString());

  // Apply sanitization and return the response
  return {
    data: sanitizedData,
    store: apiResponse.ok,
    response: new Response(
      responseBodyForStatus(apiResponse.status, JSON.stringify(sanitizedData)),
      {
        headers: omitHeaders(apiResponse.headers),
        status: apiResponse.status,
      }
    ),
  };
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const method = req.method as HttpMethod;

    if (path === '/health') {
      return new Response('OK', { status: 200 });
    }

    const filePath = getFilePath(path, queryParams, method);

    try {
      // Check if the response is cached
      if (await Bun.file(filePath).exists()) {
        console.log(`Loading cached response from ${filePath}`);
        const fileContent = await Bun.file(filePath).json();
        const responseData = path.endsWith('/configuration')
          ? withImageBaseUrl(fileContent.data)
          : fileContent.data;
        const data = fileContent.headers?.['content-type']?.includes('application/json')
          ? JSON.stringify(responseData)
          : responseData;
        return new Response(data, {
          headers: fileContent.headers || { 'Content-Type': 'application/json' },
          status: fileContent.status || 200,
        });
      }

      const requestParams: HandleRequestParams = {
        req,
        path,
        queryParams,
        method,
        filePath,
        API_KEY,
        API_SECRET,
        API_BASE_URL,
        API_HEADERS,
        API_AUTH_HEADER,
        API_AUTH_HEADER_IS_BEARER,
        RECORD_PROVIDER_FIXTURES,
      };

      const { data, store, response } =
        (await handleRequest(requestParams)) || (await defaultHandleRequest(requestParams));

      if (store) {
        await saveResponse(filePath, {
          headers: omitHeaders(response.headers),
          status: response.status,
          anonymized: ANONYMIZED_BY,
          data,
        });
      }

      return response;
    } catch (error) {
      console.error('Error handling request:', error);
      return new Response(JSON.stringify({ error: 'Failed to process request', details: error }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
});

console.log(`Mock server listening on http://localhost:${PORT}`);
console.log(`API Key configured: ${API_KEY ? 'Yes' : 'No'}`);
console.log(`API Secret configured: ${API_SECRET ? 'Yes' : 'No'}`);
console.log(`Fixture recording enabled: ${RECORD_PROVIDER_FIXTURES ? 'Yes' : 'No'}`);
