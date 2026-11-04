import { generateSecurePassword } from './password.util';

describe('generateSecurePassword', () => {
  it.each([
    [1, 0, 0, 0],
    [32, 5, 4, 3],
    [1, 5, 4, 3],
  ])(
    'preserves length and character requirements (%i, %i, %i, %i)',
    (length, numbers, uppercase, special) => {
      const password = generateSecurePassword(length, numbers, uppercase, special);
      expect(password.length).toBe(Math.max(length, 1 + numbers + uppercase + special));
      expect(password.match(/[a-z]/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(password.match(/[0-9]/g)?.length ?? 0).toBeGreaterThanOrEqual(numbers);
      expect(password.match(/[A-Z]/g)?.length ?? 0).toBeGreaterThanOrEqual(uppercase);
      expect(password.match(/[^a-zA-Z0-9]/g)?.length ?? 0).toBeGreaterThanOrEqual(special);
      expect(password).not.toContain('undefined');
    }
  );
  it('generates a password of at least the minimum length', () => {
    const password = generateSecurePassword(16);
    expect(password.length).toBeGreaterThanOrEqual(16);
  });

  it('includes at least one uppercase, number, and special character', () => {
    const password = generateSecurePassword(24, 1, 1, 1);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)).toBe(true);
  });

  it('generates different passwords each time', () => {
    const p1 = generateSecurePassword();
    const p2 = generateSecurePassword();
    expect(p1).not.toEqual(p2);
  });
});
