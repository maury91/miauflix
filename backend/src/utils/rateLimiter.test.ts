import { describe, expect, it } from "bun:test";

import { RateLimiter } from "./rateLimiter";

describe("RateLimiter", () => {
  it("should not reject if under the limit", () => {
    const limiter = new RateLimiter(2);
    expect(limiter.shouldReject()).toBe(false);
    expect(limiter.shouldReject()).toBe(false);
  });

  it("should reject if over the limit", () => {
    const limiter = new RateLimiter(1);
    limiter.shouldReject();
    expect(limiter.shouldReject()).toBe(true);
  });

  it("should allow requests after interval", async () => {
    const limiter = new RateLimiter(1);
    limiter.shouldReject();
    await new Promise((r) => setTimeout(r, 1100));
    expect(limiter.shouldReject()).toBe(false);
  });
});
