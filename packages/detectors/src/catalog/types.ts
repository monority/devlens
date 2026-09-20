/**
 * Shared declarative signature model + technology definitions.
 *
 * This module is the single home for the *shape* of every detector
 * signature. Before Step 68 the six signature interfaces
 * (`HeaderSignature`, `MetaTagSignature`, ...) each lived as a private
 * `interface` inside its detector file, and the actual signature data lived
 * as a local `const SIGNATURES` array in the same file. That meant a single
 * technology's fingerprints were scattered across detector files.
 *
 * Step 68 introduces a declarative, **per-technology** catalog:
 * `catalog/technologies/<id>.ts` describes everything about one technology
 * (id, name, category, and *all* of its signatures across every observable
 * source). The interfaces below are imported by both those definition files
 * and by the detectors (whose matching logic is unchanged — they simply read
 * signatures from the catalog via {@link signaturesFor}).
 *
 * The interface shapes are identical to the originals moved out of the
 * detector files — only their location changed.
 */

import type { ResourceType } from '@devlens/core';
import type { VersionExtraction } from '../version.js';

/**
 * The kind of structured match a {@link LinkSignature} performs on a
 * resolved `<link href>` URL.
 *
 * - `'hostname'` — exact hostname comparison (e.g. `cdn.shopify.com`).
 * - `'path_segment'` — exact path-segment comparison (e.g. `wp-content`).
 */
export type LinkMatchKind = 'hostname' | 'path_segment';

/**
 * A single header-based detection signature.
 */
export interface HeaderSignature {
  /** Canonical lowercase header name to match (e.g. `"server"`). */
  readonly headerName: string;
  /** Case-insensitive substring to search for in the header value. */
  readonly matchValue: string;
  /** Technology ID — lookup key in {@link TECHNOLOGY_CATALOG}. */
  readonly technologyId: string;
  /** Confidence score (0–100). */
  readonly confidence: number;
  /** Optional declarative version-extraction rule. */
  readonly version?: VersionExtraction;
}

/**
 * A single meta-tag-based detection signature.
 */
export interface MetaTagSignature {
  /** Canonical lowercase meta tag name to match (e.g. `"generator"`). */
  readonly tagName: string;
  /** Case-insensitive substring to search for in the meta tag content. */
  readonly matchContent: string;
  /** Technology ID — lookup key in {@link TECHNOLOGY_CATALOG}. */
  readonly technologyId: string;
  /** Confidence score (0–100). */
  readonly confidence: number;
  /** Optional declarative version-extraction rule. */
  readonly version?: VersionExtraction;
}

/**
 * A single script-URL-based detection signature.
 */
export interface ScriptUrlSignature {
  /** Case-insensitive substring to search for in the script src URL. */
  readonly matchUrl: string;
  /** Technology ID — lookup key in {@link TECHNOLOGY_CATALOG}. */
  readonly technologyId: string;
  /** Confidence score (0–100). */
  readonly confidence: number;
  /** Optional declarative version-extraction rule. */
  readonly version?: VersionExtraction;
}

/**
 * A single content-based detection signature.
 */
export interface ContentScriptSignature {
  /** Case-insensitive substring to search for in inline script content. */
  readonly matchContent: string;
  /** Technology ID — lookup key in {@link TECHNOLOGY_CATALOG}. */
  readonly technologyId: string;
  /** Confidence score (0–100). */
  readonly confidence: number;
  /** Optional declarative version-extraction rule. */
  readonly version?: VersionExtraction;
}

/**
 * A single resource-based detection signature.
 */
export interface ResourceSignature {
  /** The `Resource.type` this signature applies to. */
  readonly matchType: ResourceType;
  /** Case-insensitive substring to search for in the resource `content`. */
  readonly matchContent: string;
  /** Technology ID — lookup key in {@link TECHNOLOGY_CATALOG}. */
  readonly technologyId: string;
  /** Confidence score (0–100). */
  readonly confidence: number;
  /** Optional declarative version-extraction rule. */
  readonly version?: VersionExtraction;
}

/**
 * A single link-tag-based detection signature.
 */
export interface LinkSignature {
  /** The kind of match this signature performs. */
  readonly matchKind: LinkMatchKind;
  /** The value to match (hostname or path segment, never a glob). */
  readonly matchValue: string;
  /** Technology ID — lookup key in {@link TECHNOLOGY_CATALOG}. */
  readonly technologyId: string;
  /** Confidence score (0–100). */
  readonly confidence: number;
  /** Optional declarative version-extraction rule. */
  readonly version?: VersionExtraction;
}

/**
 * A declarative, self-describing definition of a single technology.
 *
 * One file (`catalog/technologies/<id>.ts`) exports one
 * `TechnologyDefinition`. The definition carries the canonical metadata
 * (`id`, `name`, `category`) **and** every signature for the technology,
 * grouped by observable source. A technology may legitimately have
 * signatures across multiple sources (e.g. WordPress is signatured by meta
 * generator, script URL, resource body, and link href) — co-locating them
 * here is the core payoff of Step 68: "this file describes this technology."
 *
 * Only the sources a technology actually has are populated; every signature
 * declares its own `technologyId` (which MUST equal `id` — see
 * {@link validateCatalog}).
 */
export interface TechnologyDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly headerSignatures?: readonly HeaderSignature[];
  readonly metaSignatures?: readonly MetaTagSignature[];
  readonly scriptUrlSignatures?: readonly ScriptUrlSignature[];
  readonly contentSignatures?: readonly ContentScriptSignature[];
  readonly resourceSignatures?: readonly ResourceSignature[];
  readonly linkSignatures?: readonly LinkSignature[];
}
