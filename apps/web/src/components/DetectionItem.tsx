/**
 * DetectionItem — renders a single technology detection with its evidence.
 *
 * Layout:
 *
 *   TechnologyName  ·  Category  ·  Confidence: N%
 *   └── Evidence (collapsible tree)
 *
 * Uses the confidence/score exactly as returned by the API — no
 * subjective labels, no re-sorting, no recalculation.
 */

import type { DetectionResponse } from '../lib/types.js';
import { isKnownTechnology } from '../lib/technology-catalog';
import { EvidenceList } from './EvidenceList';
import Link from 'next/link';
import styles from './ScanCard.module.css';

export interface DetectionItemProps {
  detection: DetectionResponse;
  index: number;
}

export function DetectionItem({ detection, index }: DetectionItemProps): React.ReactElement {
  const { technology, confidence, evidence } = detection;

  // If the technology is in the catalog, link the name to its detail
  // page. Unknown IDs render as plain text (no broken link).
  const techName = isKnownTechnology(technology.id) ? (
    <Link
      href={`/technologies/${encodeURIComponent(technology.id)}`}
      className={styles.techNameLink}
    >
      {technology.name}
    </Link>
  ) : (
    <span>{technology.name}</span>
  );

  return (
    <li className={styles.detectionItem} key={`${technology.id}-${index}`}>
      <header className={styles.detectionHeader}>
        <span className={styles.techName}>{techName}</span>
        <span className={styles.category}>{technology.category}</span>
        <span className={styles.score}>Confidence: {confidence}%</span>
      </header>

      {evidence.length > 0 && (
        <footer className={styles.detectionMeta}>
          <span className={styles.evidenceCount}>
            {evidence.length} evidence {evidence.length === 1 ? 'item' : 'items'}
          </span>
        </footer>
      )}

      <EvidenceList evidence={evidence} />
    </li>
  );
}
