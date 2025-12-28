import { tryParseJSON } from './json.util';

describe('tryParseJSON', () => {
  it('should parse valid JSON string', () => {
    const jsonString = '{"key":"value"}';
    const result = tryParseJSON<{ key: string }>(jsonString);
    expect(result).toEqual({ key: 'value' });
  });

  it('should return parsed object with correct type', () => {
    interface TestType {
      name: string;
      age: number;
    }
    const jsonString = '{"name":"John","age":30}';
    const result = tryParseJSON<TestType>(jsonString);
    expect(result).toEqual({ name: 'John', age: 30 });
    if (result) {
      expect(typeof result.name).toBe('string');
      expect(typeof result.age).toBe('number');
    }
  });

  it('should return undefined for invalid JSON', () => {
    const invalidJson = 'not valid json {';
    const result = tryParseJSON(invalidJson);
    expect(result).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    const result = tryParseJSON('');
    expect(result).toBeUndefined();
  });

  it('should handle JSON with nested objects', () => {
    const jsonString = '{"user":{"name":"John","address":{"city":"NYC"}}}';
    const result = tryParseJSON(jsonString);
    expect(result).toEqual({
      user: {
        name: 'John',
        address: {
          city: 'NYC',
        },
      },
    });
  });

  it('should handle JSON arrays', () => {
    const jsonString = '[1,2,3,{"key":"value"}]';
    const result = tryParseJSON(jsonString);
    expect(result).toEqual([1, 2, 3, { key: 'value' }]);
  });

  it('should handle JSON primitives - string', () => {
    const jsonString = '"hello world"';
    const result = tryParseJSON<string>(jsonString);
    expect(result).toBe('hello world');
  });

  it('should handle JSON primitives - number', () => {
    const jsonString = '42';
    const result = tryParseJSON<number>(jsonString);
    expect(result).toBe(42);
  });

  it('should handle JSON primitives - boolean true', () => {
    const jsonString = 'true';
    const result = tryParseJSON<boolean>(jsonString);
    expect(result).toBe(true);
  });

  it('should handle JSON primitives - boolean false', () => {
    const jsonString = 'false';
    const result = tryParseJSON<boolean>(jsonString);
    expect(result).toBe(false);
  });

  it('should handle JSON null', () => {
    const jsonString = 'null';
    const result = tryParseJSON<null>(jsonString);
    expect(result).toBeNull();
  });

  it('should return undefined for malformed JSON with unclosed brackets', () => {
    const invalidJson = '{"key":"value"';
    const result = tryParseJSON(invalidJson);
    expect(result).toBeUndefined();
  });

  it('should return undefined for JSON with trailing comma', () => {
    const invalidJson = '{"key":"value",}';
    const result = tryParseJSON(invalidJson);
    expect(result).toBeUndefined();
  });
});
