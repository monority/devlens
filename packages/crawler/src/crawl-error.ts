/**
 * CrawlError — infrastructure-level error produced by the HTTP crawler
 * when a crawl fails at the transport/observation layer.
 *
 * This is NOT a domain error (not {@link ScanError}). The CrawlError is
 * thrown by the crawler implementation; the application layer catches it
 * and converts it to a ScanError via `failScan`.
 */

/**
 * Error codes that can be produced by the HTTP crawler.
 *
 * - `invalid_target` — the target URL is blocked (SSRF) or malformed
 * - `timeout` — the request exceeded the configured timeout
 * - `network_error` — DNS failure, connection refused, unexpected fetch failure
 * - `too_large` — response body exceeds the configured size limit
 */
export type CrawlErrorCode = 'invalid_target' | 'timeout' | 'network_error' | 'too_large';

/**
 * Error thrown by the crawler when an observation cannot be completed.
 *
 * The `cause` property (from the standard `Error` options) preserves the
 * original error when one is available, per the Node.js error cause convention.
 */
export class CrawlError extends Error {
  readonly code: CrawlErrorCode;

  constructor(code: CrawlErrorCode, message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = 'CrawlError';

    // Restore prototype chain (required when extending built-in Error in TypeScript)
    Object.setPrototypeOf(this, CrawlError.prototype);
  }
}
