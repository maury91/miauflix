import { RateLimiterRegistry, rateLimitSubject } from './rate-limit.middleware';

describe('rateLimitSubject', () => {
  it('keeps IPv4 addresses as they are', () => {
    expect(rateLimitSubject('203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitSubject('unknown')).toBe('unknown');
  });

  it('unwraps IPv4-mapped IPv6 addresses', () => {
    expect(rateLimitSubject('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitSubject('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(rateLimitSubject('0:0:0:0:0:FFFF:CB00:7107')).toBe('203.0.113.7');
    expect(rateLimitSubject('0:0:0:0:0:ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitSubject('0:0:0:0:0:ffff:198.51.100.9')).toBe('198.51.100.9');
    expect(rateLimitSubject('::ffff:0:cb00:7107')).toBe('0:0:0:0::/64'); // IPv4-translated, not mapped
  });

  it('groups IPv6 addresses by their /64', () => {
    const a = rateLimitSubject('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    const b = rateLimitSubject('2001:0DB8:0001:0002::1');
    const c = rateLimitSubject('fe80::1%eth0');
    expect(a).toBe('2001:db8:1:2::/64');
    expect(b).toBe(a);
    expect(rateLimitSubject('2001:db8:1:3::1')).not.toBe(a);
    expect(c).toBe('fe80:0:0:0::/64');
    expect(rateLimitSubject('::1')).toBe('0:0:0:0::/64');
  });
});

describe('RateLimiterRegistry', () => {
  it('reuses the limiter of an address and route', () => {
    const registry = new RateLimiterRegistry(() => 0);
    expect(registry.get('a', '/x', 5)).toBe(registry.get('a', '/x', 5));
    expect(registry.get('a', '/y', 5)).not.toBe(registry.get('a', '/x', 5));
  });

  it('drops limiters that stayed idle', () => {
    let now = 0;
    const registry = new RateLimiterRegistry(() => now);
    registry.get('a', '/x', 5);
    now = 30_000;
    registry.get('b', '/x', 5);
    expect(registry.size).toBe(2);

    now = 70_000; // a idle for 70s, b for 40s
    registry.get('c', '/x', 5);
    expect(registry.size).toBe(2);

    now = 100_000; // b idle for 70s, c for 30s
    registry.get('c', '/x', 5);
    expect(registry.size).toBe(1);
  });

  it('keeps a fractional limiter for its whole window', () => {
    let now = 0;
    const registry = new RateLimiterRegistry(() => now);
    const slow = registry.get('a', '/x', 0.01); // one request per 100s
    now = 90_000;
    registry.get('b', '/x', 5);
    expect(registry.get('a', '/x', 0.01)).toBe(slow);
  });

  it('never evicts an active limiter past the cap: new addresses share an overflow limiter', () => {
    let now = 0;
    const registry = new RateLimiterRegistry(() => now, 2);
    const a = registry.get('a', '/x', 1);
    expect(a.limiter.shouldReject()).toBe(false);
    expect(a.limiter.shouldReject()).toBe(true); // a is at its limit
    registry.get('b', '/x', 1);

    const c = registry.get('c', '/x', 1);
    const d = registry.get('d', '/x', 1);
    expect(registry.size).toBe(2);
    expect(c).toBe(d); // one shared limiter per route
    expect(c.limiter.shouldReject()).toBe(false);
    expect(d.limiter.shouldReject()).toBe(true);
    // a kept its count instead of getting a fresh allowance.
    expect(registry.get('a', '/x', 1)).toBe(a);
    expect(a.limiter.shouldReject()).toBe(true);

    now = 61_000; // everything idle: new addresses get their own limiter again
    const e = registry.get('e', '/x', 1);
    expect(e).not.toBe(c);
    expect(registry.size).toBe(1);
  });
});
