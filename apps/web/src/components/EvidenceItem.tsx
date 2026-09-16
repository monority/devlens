/**
 * EvidenceItem — renders a single evidence item as a readable row.
 *
 * Uses the `evidence-presenter` mapping layer to translate raw evidence
 * data into human-readable labels and field values. URLs are rendered
 * as clickable links; code-like values are styled in `<code>`.
 *
 * Unknown evidence types do NOT crash — they fall back to a JSON data
 * representation via `evidenceFields()`.
 */

import type { EvidenceResponse } from '../lib/types.js';
import {
  evidenceTypeLabel,
  evidenceFields,
  evidenceIsUrl,
  evidenceUrl,
} from '../lib/evidence-presenter';
import styles from './ScanCard.module.css';

export interface EvidenceItemProps {
  evidence: EvidenceResponse;
  /** Zero-based index used as a fallback key. */
  index: number;
}

export function EvidenceItem({ evidence, index }: EvidenceItemProps): React.ReactElement {
  const label = evidenceTypeLabel(evidence.type);
  const fields = evidenceFields(evidence);
  const isUrl = evidenceIsUrl(evidence);
  const url = isUrl ? evidenceUrl(evidence) : null;

  return (
    <li className={styles.evidenceItem} key={`evidence-${evidence.type}-${index}`}>
      <span className={styles.evidenceType}>{label}</span>
      <span className={styles.evidenceFields}>
        {fields.map((field) => {
          // If this is a URL-type evidence with a URL field, render as a link.
          if (isUrl && url !== null && field.label === 'URL' && field.value === url) {
            return (
              <a
                key={field.label}
                href={url}
                className={styles.evidenceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {url}
              </a>
            );
          }
          // Render code-like values (snippets, selectors) in <code>.
          const isCodeValue = field.label === 'Snippet' || field.label === 'Selector';
          return isCodeValue ? (
            <code key={field.label} className={styles.evidenceCode}>
              {field.value}
            </code>
          ) : (
            <span key={field.label} className={styles.evidenceValue}>
              {field.value}
            </span>
          );
        })}
      </span>
    </li>
  );
}
