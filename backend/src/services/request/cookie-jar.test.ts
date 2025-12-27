import { CookieJar } from './cookie-jar';

describe('CookieJar', () => {
  describe('getCookiePairs', () => {
    it('should return empty array when domain has no cookies', () => {
      const jar = new CookieJar();
      const result = jar.getCookiePairs('example.com');
      expect(result).toEqual([]);
    });

    it('should return empty array for non-existent domain', () => {
      const jar = new CookieJar();
      jar.setCookies('example.com', 'session=abc123');
      const result = jar.getCookiePairs('other-domain.com');
      expect(result).toEqual([]);
    });

    it('should return CookiePair array for domain with cookies', () => {
      const jar = new CookieJar();
      jar.setCookies('example.com', 'session=abc123');
      const result = jar.getCookiePairs('example.com');
      expect(result).toEqual([{ name: 'session', value: 'abc123' }]);
    });

    it('should return correct name/value pairs', () => {
      const jar = new CookieJar();
      jar.setCookies('example.com', 'session=abc123; path=/');
      const result = jar.getCookiePairs('example.com');
      expect(result).toEqual([{ name: 'session', value: 'abc123' }]);
    });

    it('should handle multiple cookies for same domain', () => {
      const jar = new CookieJar();
      jar.setCookies('example.com', ['session=abc123', 'token=xyz789']);
      const result = jar.getCookiePairs('example.com');
      expect(result).toEqual([
        { name: 'session', value: 'abc123' },
        { name: 'token', value: 'xyz789' },
      ]);
    });

    it('should handle cookies with special characters in values', () => {
      const jar = new CookieJar();
      jar.setCookies('example.com', 'session=abc%20123; token=xyz=789');
      const result = jar.getCookiePairs('example.com');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('session');
    });

    it('should return cookies in the order they were set', () => {
      const jar = new CookieJar();
      jar.setCookies('example.com', 'cookie1=value1');
      jar.setCookies('example.com', 'cookie2=value2');
      const result = jar.getCookiePairs('example.com');
      expect(result.length).toBe(2);
      expect(result[0].name).toBe('cookie1');
      expect(result[1].name).toBe('cookie2');
    });
  });
});
