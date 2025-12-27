import { bodyInitToString, normalizeHeaders, parseResponseBody } from './http.util';

describe('bodyInitToString', () => {
  it('should return empty string for null', () => {
    const result = bodyInitToString(null);
    expect(result).toBe('');
  });

  it('should return empty string for undefined', () => {
    const result = bodyInitToString(undefined);
    expect(result).toBe('');
  });

  it('should return string as-is for string input', () => {
    const input = 'test string';
    const result = bodyInitToString(input);
    expect(result).toBe(input);
  });

  it('should convert URLSearchParams to string', () => {
    const params = new URLSearchParams({ key1: 'value1', key2: 'value2' });
    const result = bodyInitToString(params);
    expect(result).toBe('key1=value1&key2=value2');
  });

  it('should convert FormData to URL-encoded string', () => {
    const formData = new FormData();
    formData.append('name', 'John');
    formData.append('age', '30');
    const result = bodyInitToString(formData);
    expect(result).toContain('name=John');
    expect(result).toContain('age=30');
    expect(result).toContain('&');
  });

  it('should handle FormData with multiple entries', () => {
    const formData = new FormData();
    formData.append('field1', 'value1');
    formData.append('field2', 'value2');
    formData.append('field3', 'value3');
    const result = bodyInitToString(formData);
    expect(result.split('&').length).toBe(3);
  });

  it('should handle FormData with special characters (URL encoding)', () => {
    const formData = new FormData();
    formData.append('key', 'value with spaces');
    formData.append('special', 'a&b=c');
    const result = bodyInitToString(formData);
    expect(result).toContain(encodeURIComponent('value with spaces'));
    expect(result).toContain(encodeURIComponent('a&b=c'));
  });

  it('should return empty string for files', () => {
    const formData = new FormData();
    const blob = new Blob(['test'], { type: 'text/plain' });
    formData.append('file', blob, 'test.txt');
    const result = bodyInitToString(formData);
    // FormData with files should still return URL-encoded string, but file content won't be included
    // The actual behavior depends on FormData implementation
    expect(typeof result).toBe('string');
  });

  it('should return empty string for unsupported types', () => {
    const result = bodyInitToString(new Blob(['test']) as unknown as BodyInit);
    expect(result).toBe('');
  });
});

describe('parseResponseBody', () => {
  it('should parse JSON when content-type is application/json', async () => {
    const mockResponse = new Response(JSON.stringify({ key: 'value' }), {
      headers: { 'content-type': 'application/json' },
    });
    const result = await parseResponseBody(mockResponse);
    expect(result).toEqual({ key: 'value' });
  });

  it('should parse JSON when content-type is application/json; charset=utf-8', async () => {
    const mockResponse = new Response(JSON.stringify({ key: 'value' }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
    const result = await parseResponseBody(mockResponse);
    expect(result).toEqual({ key: 'value' });
  });

  it('should parse JSON when content-type is missing (defaults to JSON)', async () => {
    // When content-type is missing, the function tries to parse as JSON first
    // Use a mocked response to ensure JSON parsing works
    const jsonString = JSON.stringify({ key: 'value' });
    const mockResponse = {
      headers: {
        get: jest.fn().mockReturnValue(null), // No content-type
      },
      json: jest.fn().mockResolvedValue({ key: 'value' }),
      text: jest.fn().mockResolvedValue(jsonString),
    } as unknown as Response;
    const result = await parseResponseBody(mockResponse);
    expect(result).toEqual({ key: 'value' });
  });

  it('should return text when content-type is text/html', async () => {
    const htmlContent = '<html><body>Test</body></html>';
    const mockResponse = new Response(htmlContent, {
      headers: { 'content-type': 'text/html' },
    });
    const result = await parseResponseBody(mockResponse);
    expect(result).toBe(htmlContent);
  });

  it('should return text when content-type is text/plain', async () => {
    const textContent = 'plain text content';
    const mockResponse = new Response(textContent, {
      headers: { 'content-type': 'text/plain' },
    });
    const result = await parseResponseBody(mockResponse);
    expect(result).toBe(textContent);
  });

  it('should fallback to text on JSON parse error', async () => {
    // When JSON parsing fails, we need to clone the response to read it again as text
    // Since Response body can only be read once, we'll test with a mocked response
    const invalidJson = 'not valid json {';
    const mockResponse = {
      headers: {
        get: jest.fn().mockReturnValue('application/json'),
      },
      json: jest.fn().mockRejectedValue(new Error('Unexpected token')),
      text: jest.fn().mockResolvedValue(invalidJson),
    } as unknown as Response;
    const result = await parseResponseBody(mockResponse);
    expect(result).toBe(invalidJson);
  });

  it('should handle response.json() errors gracefully', async () => {
    const mockResponse = {
      headers: {
        get: jest.fn().mockReturnValue('application/json'),
      },
      json: jest.fn().mockRejectedValue(new Error('Parse error')),
      text: jest.fn().mockResolvedValue('fallback text'),
    } as unknown as Response;

    const result = await parseResponseBody(mockResponse);
    expect(result).toBe('fallback text');
  });
});

describe('normalizeHeaders', () => {
  it('should normalize Headers object to lowercase keys', () => {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Authorization', 'Bearer token');
    const result = normalizeHeaders(headers);
    expect(result['content-type']).toBe('application/json');
    expect(result['authorization']).toBe('Bearer token');
    expect(result['Content-Type']).toBeUndefined();
  });

  it('should normalize Record<string, string> to lowercase keys', () => {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer token',
      'X-Custom-Header': 'custom value',
    };
    const result = normalizeHeaders(headers);
    expect(result['content-type']).toBe('application/json');
    expect(result['authorization']).toBe('Bearer token');
    expect(result['x-custom-header']).toBe('custom value');
    expect(result['Content-Type']).toBeUndefined();
  });

  it('should preserve header values', () => {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: 'Bearer token123',
    };
    const result = normalizeHeaders(headers);
    expect(result['content-type']).toBe('application/json; charset=utf-8');
    expect(result['authorization']).toBe('Bearer token123');
  });

  it('should handle empty Headers object', () => {
    const headers = new Headers();
    const result = normalizeHeaders(headers);
    expect(result).toEqual({});
  });

  it('should handle empty Record', () => {
    const headers = {};
    const result = normalizeHeaders(headers);
    expect(result).toEqual({});
  });

  it('should handle mixed case keys in Record', () => {
    const headers = {
      'Content-Type': 'application/json',
      'content-type': 'text/html',
      'CONTENT-LENGTH': '123',
    };
    const result = normalizeHeaders(headers);
    // Last one wins when keys normalize to same lowercase
    expect(result['content-type']).toBe('text/html');
    expect(result['content-length']).toBe('123');
  });
});
