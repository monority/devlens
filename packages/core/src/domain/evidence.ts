/**
 * Evidence — factual observations that explain why a detection exists.
 *
 * Evidence is modelled as a discriminated union. Each variant captures
 * a different kind of observation that can support a technology
 * detection. The domain does not implement detection logic or DOM/HTTP
 * parsing — it only defines the shape of evidence records that
 * detectors (a later step) will populate.
 */

import type { Url } from './value-objects.js';

/**
 * Evidence that a technology's signature was found in raw HTML.
 */
export interface HtmlEvidence {
  readonly type: 'html';
  readonly selector: string;
  readonly snippet: string;
}

/**
 * Evidence that a technology was detected via an HTTP response header.
 */
export interface HttpHeaderEvidence {
  readonly type: 'http_header';
  readonly name: string;
  readonly value: string;
}

/**
 * Evidence that a technology was detected via a script URL
 * loaded by the page (e.g. a known vendor bundle).
 */
export interface ScriptUrlEvidence {
  readonly type: 'script_url';
  readonly url: Url;
}

/**
 * Evidence that a technology was detected via a fingerprint found in the
 * content of an inline `<script>` tag (e.g. `__NEXT_DATA__` in an
 * inline Next.js bootstrap script). Only a small relevant fragment
 * (the matched fingerprint) is stored — never the full script source.
 */
export interface ScriptContentEvidence {
  readonly type: 'script_content';
  readonly snippet: string;
}

/**
 * Evidence that a technology was detected via an HTML meta tag
 * (e.g. `<meta name="generator" content="Hugo">`).
 */
export interface MetaTagEvidence {
  readonly type: 'meta_tag';
  readonly name: string;
  readonly content: string;
}

/**
 * Evidence that a technology was detected via a JavaScript global
 * variable available on `window` or `globalThis`.
 */
export interface JavaScriptGlobalEvidence {
  readonly type: 'javascript_global';
  readonly globalName: string;
}

/**
 * Evidence that a technology was detected via a loaded resource
 * (e.g. a specific image, font, or asset URL).
 */
export interface ResourceEvidence {
  readonly type: 'resource';
  readonly url: Url;
}

/**
 * Evidence that a technology was detected via an HTML `<link>` tag
 * (e.g. a stylesheet pointing to `cdn.shopify.com`).
 */
export interface LinkEvidence {
  readonly type: 'link';
  readonly url: Url;
}

/**
 * Discriminated union of all evidence types.
 *
 * The `type` field is the discriminant — consumers can narrow the type
 * with a `switch` or `if` on `evidence.type`.
 */
export type Evidence =
  | HtmlEvidence
  | HttpHeaderEvidence
  | ScriptUrlEvidence
  | ScriptContentEvidence
  | MetaTagEvidence
  | JavaScriptGlobalEvidence
  | ResourceEvidence
  | LinkEvidence;
