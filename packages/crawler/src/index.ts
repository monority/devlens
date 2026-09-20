/**
 * @devlens/crawler — crawler boundary and HTTP implementation.
 *
 * Exports the {@link Crawler} interface that defines the contract
 * between the DevLens domain and the crawler implementation, plus the
 * {@link HttpCrawler} concrete implementation using native fetch.
 * Depends on @devlens/core for domain types.
 */

export type { Crawler } from './crawler.js';
export { HttpCrawler } from './http-crawler.js';
export type { HttpCrawlerOptions } from './http-crawler.js';
export { CrawlError } from './crawl-error.js';
export type { CrawlErrorCode } from './crawl-error.js';
export { isResourceUrlAllowed, isResourceFetchable } from './ssrf-guard.js';
export {
  discoverResources,
  selectResources,
  classifyResource,
  compareResources,
  DEFAULT_RESOURCE_POLICY,
} from './resource-intelligence.js';
export type {
  ResourcePolicy,
  DiscoveredResource,
  SelectedResource,
  SelectionResult,
} from './resource-intelligence.js';
