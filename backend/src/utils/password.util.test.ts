import { describe, expect, it } from "bun:test";

import { generateSecurePassword } from "./password.util";

describe("generateSecurePassword", () => {
  it("generates a password of at least the minimum length", () => {
    const password = generateSecurePassword(16);
    expect(password.length).toBeGreaterThanOrEqual(16);
  });

  it("includes at least one uppercase, number, and special character", () => {
    const password = generateSecurePassword(24, 1, 1, 1);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)).toBe(true);
  });

  it("generates different passwords each time", () => {
    const p1 = generateSecurePassword();
    const p2 = generateSecurePassword();
    expect(p1).not.toEqual(p2);
  });
});
