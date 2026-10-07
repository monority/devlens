/**
 * In-memory rate limiter for API endpoints.
 *
 * Simple sliding-window counter per client IP. Sufficient for single-instance
 * deployments; a Redis-backed implementation (e.g. `@upstash/ratelimit`)
 * should be used for multi-instance scaling.
 *
 * Rate limits:
 * - POST /api/scans (scan creation): 10 req/min per IP — expensive operation
 * - GET /api/scans (listing): 60 req/min per IP — cheap read
 */
import { NextResponse } from 'next/server';

/** Configuration for a named rate-limit bucket. */
export interface RateLimitConfig {
  /** Maximum requests allowed in the window. */
  readonly max: number;
  /** Window size in milliseconds. */
  readonly windowMs: number;
}

/** Default limits per endpoint type. */
export const RATE_LIMITS = {
  scan: { max: 10, windowMs: 60_000 }, // 10 scan/min — crawling is expensive
  read: { max: 60, windowMs: 60_000 }, // 60 reads/min — cheap
} as const satisfies Record<string, RateLimitConfig>;

/** Internal entry stored per IP. */
interface Bucket {
  /** Number of requests in the current window. */
  count: number;
  /** Timestamp when the window started (ms since epoch). */
  windowStart: number;
}

/**
 * Simple sliding-window rate limiter using an in-memory Map.
 * Each (IP, scope) pair gets its own bucket. Expired windows are
 * garbage-collected lazily on access.
 */
export class RateLimiter {
  private readonly buckets: Map<string, Bucket> = new Map();
  /** Cleanup interval to evict stale entries (prevents unbounded memory growth). */
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Evict buckets older than 5x the max window every 10 seconds.
    this.cleanupInterval = setInterval(() => this.cleanup(), 10_000);
  }

  /**
   * Checks if a request from `ip` under `scope` is allowed.
   *
   * @returns `{ allowed: true }` if the request passes, or
   *          `{ allowed: false, retryAfterMs, remaining }` if rate-limited.
   */
  check(ip: string, scope: keyof typeof RATE_LIMITS = 'scan'): {
    allowed: true;
    remaining: number;
  } | {
    allowed: false;
    remaining: 0;
    retryAfterMs: number;
  } {
    const config = RATE_LIMITS[scope];
    const now = Date.now();
    const key = `${scope}:${ip}`;
    const bucket = this.buckets.get(key);

    if (bucket === undefined) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: config.max - 1 };
    }

    const elapsed = now - bucket.windowStart;

    // Window has elapsed — reset.
    if (elapsed >= config.windowMs) {
      bucket.count = 1;
      bucket.windowStart = now;
      return { allowed: true, remaining: config.max - 1 };
    }

    // Within the window — check limit.
    if (bucket.count >= config.max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: config.windowMs - elapsed,
      };
    }

    bucket.count += 1;
    return { allowed: true, remaining: config.max - bucket.count };
  }

  /** Evicts buckets whose window has fully elapsed. */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      const [scopeKey] = key.split(':');
      const config = RATE_LIMITS[scopeKey as keyof typeof RATE_LIMITS];
      if (config && now - bucket.windowStart > config.windowMs) {
        this.buckets.delete(key);
      }
    }
  }

  /** Stops the cleanup interval — call on process shutdown. */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

/** Shared singleton for the duration of the Next.js process. */
export const rateLimiter = new RateLimiter();

/**
 * Helper: checks rate limit and returns a `NextResponse.json` with 429
 * if the limit is exceeded, including `Retry-After` and
 * `X-RateLimit-Remaining` headers.
 *
 * Usage in route handlers:
 * ```ts
 * const rateLimit = checkRateLimit(request, 'scan');
 * if (rateLimit) return rateLimit;
 * ```
 */
export function rateLimitedResponse(scope: keyof typeof RATE_LIMITS, ip: string) {
  const result = rateLimiter.check(ip, scope);
  if (result.allowed) {
    return null;
  }
  return NextResponse.json(
    { error: { code: 'RATE_LIMITED', message: 'Too many requests.' } },
    {
      status: 429,
      headers: {
        'Retry-After': Math.ceil(result.retryAfterMs / 1000).toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': Math.ceil(
          (Date.now() + result.retryAfterMs) / 1000,
        ).toString(),
      },
    },
  );
}
