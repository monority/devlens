/**
 * Evidence presentation mapping layer.
 *
 * Maps raw `EvidenceResponse` data (the exact shapes returned by the API)
 * into human-readable presentation primitives. This is a **pure module**
 * with zero React or DOM dependencies — it can be unit-tested directly
 * and reused by any rendering component.
 *
 * Key principles:
 * - Uses the actual evidence data already returned by the API.
 * - Does NOT reproduce detector implementation details.
 * - Safely handles unknown / future evidence types without crashing.
 * - No subjective labels ("likely", "weak", etc.).
 */

import type { EvidenceResponse } from '../lib/types.js';

/**
 * A single field extracted from an evidence item for display.
 */
export interface EvidenceField {
  /** Human-readable label for the field. */
  label: string;
  /** The field value as a string. */
  value: string;
}

/**
 * A human-readable label for an evidence type.
 *
 * Falls back to `'Evidence'` for unknown types — the UI never crashes
 * on unrecognized evidence.
 */
export function evidenceTypeLabel(type: EvidenceResponse['type']): string {
  switch (type) {
    case 'http_header':
      return 'HTTP Header';
    case 'meta_tag':
      return 'Meta Tag';
    case 'script_url':
      return 'Script URL';
    case 'script_content':
      return 'Script Content';
    case 'html':
      return 'HTML Element';
    case 'javascript_global':
      return 'JavaScript Global';
    case 'resource':
      return 'Resource URL';
    case 'link':
      return 'Link';
    default:
      return 'Evidence';
  }
}

/**
 * Extracts the display fields for a given evidence item.
 *
 * Each evidence variant maps to a small array of `{ label, value }` pairs.
 * For `script_url`, `resource`, and `link` types, the value is a URL.
 * For unknown evidence types, a single fallback field is returned that
 * contains the JSON representation of the evidence object.
 */
export function evidenceFields(item: EvidenceResponse): EvidenceField[] {
  switch (item.type) {
    case 'http_header':
      return [{ label: 'Header', value: `${item.name}: ${item.value}` }];
    case 'meta_tag':
      return [{ label: 'Meta Tag', value: `${item.name}: ${item.content}` }];
    case 'script_url':
      return [{ label: 'URL', value: item.url }];
    case 'script_content':
      return [{ label: 'Snippet', value: item.snippet }];
    case 'html':
      return [
        { label: 'Selector', value: item.selector },
        { label: 'Snippet', value: item.snippet },
      ];
    case 'javascript_global':
      return [{ label: 'Global', value: item.globalName }];
    case 'resource':
      return [{ label: 'URL', value: item.url }];
    case 'link':
      return [{ label: 'URL', value: item.url }];
    default: {
      // Safe fallback for future/unknown evidence types — never crashes.
      return [{ label: 'Data', value: JSON.stringify(item) }];
    }
  }
}

/**
 * Returns `true` if the evidence item contains a URL value.
 *
 * URLs are rendered as clickable `<a>` links in the UI component.
 */
export function evidenceIsUrl(item: EvidenceResponse): boolean {
  switch (item.type) {
    case 'script_url':
    case 'resource':
    case 'link':
      return true;
    default:
      return false;
  }
}

/**
 * Extracts the URL string from a URL-type evidence item.
 * Returns `null` for non-URL evidence types.
 */
export function evidenceUrl(item: EvidenceResponse): string | null {
  switch (item.type) {
    case 'script_url':
    case 'resource':
    case 'link':
      return item.url;
    default:
      return null;
  }
}
