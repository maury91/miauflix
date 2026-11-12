import { LoginThrottle } from './login-throttle';

describe('LoginThrottle', () => {
  const setupTest = (maxEntries?: number) => {
    let now = 0;
    const throttle = new LoginThrottle(3, 60_000, () => now, maxEntries);
    const failOnce = (email: string) => {
      expect(throttle.begin(email)).toBe(0);
      throttle.fail(email);
    };
    return { throttle, failOnce, advance: (ms: number) => (now += ms) };
  };

  it('blocks an account after the allowed failures until the window ends', () => {
    const { throttle, failOnce, advance } = setupTest();
    for (let i = 0; i < 3; i++) failOnce('User@Example.com');
    expect(throttle.begin('user@example.com')).toBe(60);
    advance(45_000);
    expect(throttle.begin(' USER@example.com ')).toBe(15);
    advance(15_000);
    expect(throttle.begin('user@example.com')).toBe(0);
  });

  it('allows logins below the limit and forgets failures after a success', () => {
    const { throttle, failOnce } = setupTest();
    failOnce('a@example.com');
    failOnce('a@example.com');
    expect(throttle.begin('a@example.com')).toBe(0);
    throttle.succeed('a@example.com');
    failOnce('a@example.com');
    failOnce('a@example.com');
    expect(throttle.begin('a@example.com')).toBe(0);
  });

  it('counts accounts separately', () => {
    const { throttle, failOnce } = setupTest();
    for (let i = 0; i < 3; i++) failOnce('a@example.com');
    expect(throttle.begin('b@example.com')).toBe(0);
  });

  it('counts attempts in flight against the limit', () => {
    const { throttle } = setupTest();
    for (let i = 0; i < 3; i++) expect(throttle.begin('a@example.com')).toBe(0);
    expect(throttle.begin('a@example.com')).toBe(1);
    throttle.release('a@example.com');
    expect(throttle.begin('a@example.com')).toBe(0);
    for (let i = 0; i < 3; i++) throttle.fail('a@example.com');
    expect(throttle.begin('a@example.com')).toBe(60);
  });

  it('stays bounded, dropping the oldest accounts first', () => {
    const { throttle, failOnce } = setupTest(2);
    for (let i = 0; i < 3; i++) failOnce('a@example.com');
    failOnce('b@example.com');
    failOnce('c@example.com');
    expect(throttle.begin('a@example.com')).toBe(0);
  });
});
