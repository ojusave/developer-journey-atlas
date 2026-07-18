// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "./rate-limit.js";

describe("fixed-window abuse control", () => {
  it("allows the configured budget, blocks the next request, and resets", () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000);
    expect(limiter.consume("client", 0).allowed).toBe(true);
    expect(limiter.consume("client", 100).allowed).toBe(true);
    const blocked = limiter.consume("client", 200);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(limiter.consume("client", 1_001).allowed).toBe(true);
  });
});
