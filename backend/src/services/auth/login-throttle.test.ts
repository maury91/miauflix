import { LoginThrottle } from './login-throttle';

describe('LoginThrottle', () => {
  const setupTest = () => {
    let now = 0;
    const throttle = new LoginThrottle(3, 60_000, () => now);
    return { throttle, advance: (ms: number) => (now += ms) };
  };

  it('blocks an account after the allowed failures until the window ends', () => {
    const { throttle, advance } = setupTest();
    for (let i = 0; i < 3; i++) throttle.recordFailure('User@Example.com');
    expect(throttle.retryAfter('user@example.com')).toBe(60);
    advance(45_000);
    expect(throttle.retryAfter(' USER@example.com ')).toBe(15);
    advance(15_000);
    expect(throttle.retryAfter('user@example.com')).toBe(0);
  });

  it('allows logins below the limit and forgets failures after a success', () => {
    const { throttle } = setupTest();
    throttle.recordFailure('a@example.com');
    throttle.recordFailure('a@example.com');
    expect(throttle.retryAfter('a@example.com')).toBe(0);
    throttle.recordSuccess('a@example.com');
    throttle.recordFailure('a@example.com');
    throttle.recordFailure('a@example.com');
    expect(throttle.retryAfter('a@example.com')).toBe(0);
  });

  it('counts accounts separately', () => {
    const { throttle } = setupTest();
    for (let i = 0; i < 3; i++) throttle.recordFailure('a@example.com');
    expect(throttle.retryAfter('b@example.com')).toBe(0);
  });
});
