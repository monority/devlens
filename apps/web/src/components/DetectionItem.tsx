/**
 * DetectionItem — renders a single technology detection with its evidence.
 *
 * Layout:
 *
 *   TechnologyName  ·  Category  ·  Confidence: N
 *   └── Explanation (evidence coverage summary)
 *   └── Evidence source list (concise origin descriptions)
 *   └── Evidence (collapsible tree)
 *
 * Uses the confidence/score exactly as returned by the API — no
 * subjective labels, no re-sorting, no recalculation.
 *
 * Evidence source descriptions are derived from existing evidence fields
 * (via `getDetectionExplainability`) — no new data is invented.
 */

import type { DetectionResponse } from '../lib/types.js';
import { isKnownTechnology } from '../lib/technology-catalog';
import { getDetectionExplainability } from '../lib/detection-explainability';
import { EvidenceList } from './EvidenceList';
import Link from 'next/link';
import styles from './ScanCard.module.css';

export interface DetectionItemProps {
  detection: DetectionResponse;
  index: number;
}

export function DetectionItem({ detection, index }: DetectionItemProps): React.ReactElement {
  const {
    technology,
    confidence,
    version,
    versionConflict,
    versionSource,
    source,
    derivedFrom,
    relationshipConflicts,
  } = detection;
  const isDerived = source === 'relationship';
  const derivedSource = derivedFrom?.[0];
  const derivedLabel = derivedSource
    ? `${derivedSource.sourceName ?? derivedSource.source} (implies)`
    : 'relationship';

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

  // Derive a structured explanation from the detection's actual evidence.
  const explainability = getDetectionExplainability(detection);

  return (
    <li className={styles.detectionItem} key={`${technology.id}-${index}`}>
      <header className={styles.detectionHeader}>
        <span className={styles.techName}>{techName}</span>
        <span className={styles.category}>{technology.category}</span>
        <span className={styles.score}>Confidence: {confidence}</span>
        {version ? <span className={styles.version}>Version: {version}</span> : null}
        {/* Step 72 — conflict override. When evidence sources disagreed the
            consensus is refused, `version` is null and we render a conflict
            notice (never a fabricated/placeholder version). */}
        {versionConflict ? (
          <span className={styles.versionConflict}>Version: unavailable — conflict detected</span>
        ) : null}
        {versionSource ? <span className={styles.versionSource}>{versionSource}</span> : null}

        {/* Step 69: distinguisher for inferred detections and conflicts */}
        {isDerived ? <span className={styles.derived}>Derived from {derivedLabel}</span> : null}
        {relationshipConflicts && relationshipConflicts.length > 0 ? (
          <span className={styles.relationshipConflict}>
            Conflict: {relationshipConflicts.map((c) => `${c.type} (${c.other})`).join(', ')}
          </span>
        ) : null}
      </header>

      {/* Explanation: neutral summary of evidence coverage */}
      <p className={styles.detectionExplanation}>{explainability.summary}</p>

      {explainability.evidenceCount > 0 && (
        <footer className={styles.detectionMeta}>
          <span className={styles.evidenceCount}>
            {explainability.evidenceCount} evidence{' '}
            {explainability.evidenceCount === 1 ? 'item' : 'items'}
          </span>
        </footer>
      )}

      {/* Evidence source list: concise per-evidence origin descriptions */}
      {explainability.evidenceSources.length > 0 && (
        <ul className={styles.evidenceSourceList}>
          {explainability.evidenceSources.map((source, sourceIndex) => (
            <li
              key={`evidence-source-${sourceIndex}`}
              className={styles.evidenceSourceItem}
              title={source.value}
            >
              <span className={styles.evidenceSourceType}>{source.type}</span>
              <span className={styles.evidenceSourceDesc}>{source.source}</span>
            </li>
          ))}
        </ul>
      )}

      <EvidenceList evidence={explainability.evidence} />
    </li>
  );
}
