/**
 * Declarative technology-version extraction for detectors.
 *
 * This module provides the **shared, reusable version-extraction
 * representation** used by the existing detector signature tables
 * (`@devlens/detectors` keeps one signature model — there is no second
 * detection engine here). A signature may declare an optional
 * {@link VersionExtraction} that describes how to pull a technology
 * version out of the *same observable value* that triggered the
 * detection in the first place. This keeps every version explainable by
 * an evidence item already attached to the {@link Detection}.
 *
 * Extraction is always:
 *   - deterministic (same input → same output)
 *   - conservative (no match / malformed → `null`, never a fabricated version)
 *   - boundary-validated (the raw capture is run through
 *     {@link createTechnologyVersion}, which rejects empty/whitespace/
 *     multiline/overlong values)
 */

import { createTechnologyVersion, type TechnologyVersion } from '@devlens/core';

/**
 * How a version is expressed in the matched observable.
 *
 * - `pattern` — a regex applied to the matched observable value. The
 *   first capturing group is taken as the version; if the pattern has no
 *   capturing group, the full match is used. An optional `captureGroup`
 *   may select a different group explicitly.
 *
 * The pattern is expected to be anchored/literal enough to describe
 * *this technology's* version format only — there is no global version
 * heuristics layer.
 */
export interface VersionRule {
  /** Regex applied to the matched observable value. */
  readonly pattern: RegExp;
  /**
   * Optional explicit capture-group index (1-based). Defaults to `1` when
   * the pattern has a capturing group, otherwise `0` (the full match).
   */
  readonly captureGroup?: number;
}

/**
 * A declarative version-extraction rule attached to a signature.
 *
 * `source` labels *which* observable the version is read from. Today only
 * `'matchedValue'` is used (the substring/parameter that caused the
 * signature to match — e.g. the header value, the meta `content`, or the
 * script URL). The label is future-proofing: if version data is ever
 * read from a sibling field of the snapshot, a new source can be added
 * without changing the extraction algorithm.
 */
export interface VersionExtraction {
  readonly source: 'matchedValue';
  readonly rule: VersionRule;
}

/**
 * Extracts a technology version from the matched observable value using a
 * signature's declared {@link VersionExtraction}.
 *
 * Returns `null` when:
 *   - the signature declares no `version` extraction rule, or
 *   - the value does not match the pattern, or
 *   - the captured text fails {@link createTechnologyVersion} validation
 *     (empty, whitespace-only, multiline, or overlong). The failure is
 *     swallowed so that detectors never throw on malformed data — a
 *     malformed version is treated as "no version" (conservative).
 *
 * @returns a branded {@link TechnologyVersion} or `null`.
 */
export function extractVersion(value: string, spec?: VersionExtraction): TechnologyVersion | null {
  if (!spec) {
    return null;
  }
  const match = value.match(spec.rule.pattern);
  if (match === null) {
    return null;
  }
  const groupIndex = spec.rule.captureGroup ?? (match[1] !== undefined ? 1 : 0);
  const raw = match[groupIndex];
  if (raw === undefined) {
    return null;
  }
  try {
    return createTechnologyVersion(raw);
  } catch {
    return null;
  }
}
