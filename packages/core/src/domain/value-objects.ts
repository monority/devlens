/**
 * Value objects for the DevLens domain model.
 *
 * These are branded primitive types with factory functions that enforce
 * domain invariants at the boundary. Branding prevents accidental
 * assignment of a raw string/number where a domain-concept type is expected.
 */

// ─── IDs ───────────────────────────────────────────────────────────

/** Unique identifier for a Scan. Branded to prevent mixing with arbitrary strings. */
export type ScanId = string & { readonly _brand: 'ScanId' };

/** Unique identifier for a Technology. Branded to prevent mixing with arbitrary strings. */
export type TechnologyId = string & { readonly _brand: 'TechnologyId' };

/**
 * Creates a {@link ScanId} from a raw string.
 * @throws {Error} if the id is empty.
 */
export function createScanId(id: string): ScanId {
  if (id.trim() === '') {
    throw new Error('ScanId must not be empty');
  }
  return id as ScanId;
}

/**
 * Creates a {@link TechnologyId} from a raw string.
 * @throws {Error} if the id is empty.
 */
export function createTechnologyId(id: string): TechnologyId {
  if (id.trim() === '') {
    throw new Error('TechnologyId must not be empty');
  }
  return id as TechnologyId;
}

// ─── URL & Hostname ────────────────────────────────────────────────

/**
 * The original URL supplied as a scan target or observed in a response.
 * Branded to distinguish it from arbitrary strings and prevent confusion
 * with other string-based concepts.
 */
export type Url = string & { readonly _brand: 'Url' };

/**
 * A hostname/domain associated with a target or snapshot.
 * Stored alongside {@link Url} because the associated hostname may differ
 * from a simple derivation of the URL (e.g. redirects, CDN mappings).
 */
export type Hostname = string & { readonly _brand: 'Hostname' };

/**
 * Creates a {@link Url} from a raw string.
 * @throws {Error} if the url is empty.
 */
export function createUrl(url: string): Url {
  if (url.trim() === '') {
    throw new Error('Url must not be empty');
  }
  return url as Url;
}

/**
 * Creates a {@link Hostname} from a raw string.
 * @throws {Error} if the hostname is empty.
 */
export function createHostname(hostname: string): Hostname {
  if (hostname.trim() === '') {
    throw new Error('Hostname must not be empty');
  }
  return hostname as Hostname;
}

// ─── Timestamp ─────────────────────────────────────────────────────

/**
 * An instant in time represented as an ISO 8601 string.
 * Using a string (not a {@link Date}) keeps the domain portable —
 * it makes no assumptions about the runtime environment.
 */
export type Timestamp = string & { readonly _brand: 'Timestamp' };

/**
 * Creates a {@link Timestamp} from a {@link Date} instance.
 * (Date is a standard JavaScript global, not Node-specific.)
 */
export function createTimestamp(date: Date): Timestamp {
  const iso = date.toISOString();
  if (iso === 'Invalid Date') {
    throw new Error('Cannot create Timestamp from invalid Date');
  }
  return iso as Timestamp;
}

/**
 * Creates a {@link Timestamp} from an ISO 8601 string.
 * @throws {Error} if the string is not a valid ISO date.
 */
export function createTimestampFromString(isoString: string): Timestamp {
  if (isoString.trim() === '') {
    throw new Error('Timestamp must not be empty');
  }
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid timestamp string: ${isoString}`);
  }
  return parsed.toISOString() as Timestamp;
}

// ─── Confidence ────────────────────────────────────────────────────

/**
 * A detection confidence expressed as a percentage in the range [0, 100].
 *
 * Invariant: `0 ≤ value ≤ 100` and the value must be a finite number.
 * - 0   = not confident at all
 * - 100 = completely certain
 */
export type Confidence = number & { readonly _brand: 'Confidence' };

/**
 * Creates a {@link Confidence} from a numeric value.
 * @throws {Error} if the value is NaN, non-finite, or outside [0, 100].
 */
export function createConfidence(value: number): Confidence {
  if (!Number.isFinite(value)) {
    throw new Error(`Confidence must be a finite number, got ${value}`);
  }
  if (value < 0 || value > 100) {
    throw new Error(`Confidence must be between 0 and 100 (inclusive), got ${value}`);
  }
  return value as Confidence;
}

// ─── Technology Version ──────────────────────────────────────────

/**
 * An optional technology version extracted from evidence (e.g.
 * `1.21.6` from `Server: nginx/1.21.6`, or `6.4.2` from a WordPress
 * generator meta tag).
 *
 * Branded to distinguish it from arbitrary strings — a version is only
 * ever constructed through {@link createTechnologyVersion}, which enforces
 * the domain invariants below. This prevents malformed or fabricated
 * versions from entering a {@link Detection}.
 *
 * Invariant: non-empty (after trimming), single-line, and at most 64
 * characters. No format is enforced beyond that — version strings are
 * intentionally allowed to vary (e.g. `10.0`, `8.2.10`, `4.17.21`).
 */
export type TechnologyVersion = string & { readonly _brand: 'TechnologyVersion' };

/**
 * Creates a {@link TechnologyVersion} from a raw extracted string.
 *
 * The value is validated at this boundary so that no malformed version
 * can enter the domain model:
 * - must be a string
 * - must be non-empty after trimming surrounding whitespace
 * - must be a single line (no tabs / newlines / carriage returns)
 * - must be at most 64 characters long
 *
 * @throws {Error} if any invariant is violated.
 */
export function createTechnologyVersion(value: string): TechnologyVersion {
  if (typeof value !== 'string') {
    throw new Error('TechnologyVersion must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('TechnologyVersion must not be empty');
  }
  if (trimmed.length > 64) {
    throw new Error('TechnologyVersion must be at most 64 characters');
  }
  if (/[\r\n\t]/.test(trimmed)) {
    throw new Error('TechnologyVersion must be a single line');
  }
  return trimmed as TechnologyVersion;
}

// ─── HTTP Status ──────────────────────────────────────────────────

/**
 * An HTTP response status code. Invariant: integer in [100, 599].
 */
export type HttpStatus = number & { readonly _brand: 'HttpStatus' };

/**
 * Creates an {@link HttpStatus} from a numeric code.
 * @throws {Error} if the value is not an integer or is outside [100, 599].
 */
export function createHttpStatus(code: number): HttpStatus {
  if (!Number.isInteger(code)) {
    throw new Error(`HTTP status code must be an integer, got ${code}`);
  }
  if (code < 100 || code > 599) {
    throw new Error(`HTTP status code must be between 100 and 599, got ${code}`);
  }
  return code as HttpStatus;
}
