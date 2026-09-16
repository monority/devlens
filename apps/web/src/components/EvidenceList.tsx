/**
 * EvidenceList — renders all evidence items for a single detection.
 *
 * Uses a collapsible `<details>` / `<summary>` element so that evidence
 * is inspectable without overwhelming the initial view. This is:
 * - Semantic HTML (natively accessible, keyboard-operable)
 * - No JavaScript required for expand/collapse
 * - No color-dependent communication
 *
 * If the evidence array is empty, the list renders nothing.
 */

import type { EvidenceResponse } from '../lib/types.js';
import { EvidenceItem } from './EvidenceItem';
import styles from './ScanCard.module.css';

export interface EvidenceListProps {
  evidence: EvidenceResponse[];
}

export function EvidenceList({ evidence }: EvidenceListProps): React.ReactElement | null {
  if (evidence.length === 0) {
    return null;
  }

  return (
    <details className={styles.evidenceTree}>
      <summary className={styles.evidenceSummary}>Evidence ({evidence.length})</summary>
      <ul className={styles.evidenceList}>
        {evidence.map((item, index) => (
          <EvidenceItem key={`evidence-${item.type}-${index}`} evidence={item} index={index} />
        ))}
      </ul>
    </details>
  );
}
