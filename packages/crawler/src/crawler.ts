/**
 * Crawler boundary — the contract between the DevLens domain and the
 * crawler implementation.
 *
 * This interface is the architectural boundary. It depends only on
 * `@devlens/core` domain types (`ScanTarget`, `SiteSnapshot`) and
 * makes no assumptions about HTTP, Playwright, Node.js, or any
 * specific runtime.
 *
 * The actual HTTP implementation (Playwright, fetch, etc.) lives in
 * a separate layer that implements this interface.
 */

import type { ScanTarget, SiteSnapshot } from '@devlens/core';

/**
 * Crawler abstraction.
 *
 * Given a {@link ScanTarget}, the crawler produces a
 * {@link SiteSnapshot} — an immutable observation of the website at
 * a particular moment.
 *
 * The domain lifecycle (`ScanStatus`) is decoupled from this contract:
 * `crawl()` returns the observed result. The application layer is
 * responsible for advancing the scan lifecycle (calling `completeScan`
 * or `failScan`) based on the outcome.
 *
 * On failure, the crawler throws an `Error`. The application layer
 * catches it and converts it to a `ScanError` via `failScan`.
 */
export interface Crawler {
  /**
   * Crawls the target URL and produces a {@link SiteSnapshot}.
   *
   * @param target - The website to crawl (URL + associated hostname).
   * @returns A {@link SiteSnapshot} capturing the observed state.
   * @throws {Error} if the crawl fails (network error, timeout,
   *   non-2xx response, etc.).
   */
  crawl(target: ScanTarget): Promise<SiteSnapshot>;
}
