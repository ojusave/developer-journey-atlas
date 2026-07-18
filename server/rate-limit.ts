import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AppError } from "./errors.js";

interface Bucket {
  startedAt: number;
  count: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  consume(key: string, now = Date.now()): RateLimitResult {
    const current = this.buckets.get(key);
    const bucket = !current || now - current.startedAt >= this.windowMs
      ? { startedAt: now, count: 0 }
      : current;
    bucket.count += 1;
    this.buckets.set(key, bucket);
    if (this.buckets.size > 10_000) this.prune(now);
    const elapsed = Math.max(0, now - bucket.startedAt);
    return {
      allowed: bucket.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((this.windowMs - elapsed) / 1_000)),
    };
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.startedAt >= this.windowMs) this.buckets.delete(key);
    }
  }
}

export function anonymousClientKey(request: IncomingMessage, trustProxy: boolean, secret: Buffer): string {
  const forwarded = trustProxy && typeof request.headers["x-forwarded-for"] === "string"
    ? request.headers["x-forwarded-for"].split(",")[0]?.trim()
    : "";
  const address = forwarded || request.socket.remoteAddress || "unknown";
  return createHmac("sha256", secret).update(`client:${address}`).digest("hex");
}

export function enforceRateLimit(limiter: FixedWindowRateLimiter, key: string, response: ServerResponse): void {
  const result = limiter.consume(key);
  response.setHeader("RateLimit-Limit", String(result.limit));
  response.setHeader("RateLimit-Remaining", String(result.remaining));
  if (!result.allowed) {
    response.setHeader("Retry-After", String(result.retryAfterSeconds));
    throw new AppError(429, "rate_limited", "Too many requests. Wait briefly and try again.", {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}
