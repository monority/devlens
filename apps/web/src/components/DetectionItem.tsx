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
import { evidenceFields, evidenceTypeLabel } from '../lib/evidence-presenter';
import { getDetectionPresentation } from '../lib/detection-presentation';
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
  const explainability = detection.explanation ?? getDetectionExplainability(detection);
  const present = getDetectionPresentation(detection, explainability);

  return (
    <li className={styles.detectionItem} key={`${technology.id}-${index}`}>
      <header className={styles.detectionHeader}>
        <span className={styles.techName}>{techName}</span>
        <span className={styles.category}>{technology.category}</span>
        <span className={styles.signalQualityLine}>{present.combinedHeaderLabel}</span>
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
            Conflict: {relationshipConflicts.map((c) => `${c.type} (${c.other})`)}
          </span>
        ) : null}
      </header>

      {/* Explanation: structured "Detected because" reasons in deterministic
          order. Each reason line is a renderable explanation of WHY the
          detection is considered present — derived purely from existing data.
          This replaces the previous neutral summary paragraph. */}
      <section className={styles.explanationReasons}>
        <h3 className={styles.explanationReasonsHeading}>Detected because</h3>

        {explainability.reasons.length > 0 ? (
          <ul className={styles.evidenceSourceList}>
            {explainability.reasons.map((reason, reasonIndex) => {
              if (reason.kind === 'evidence') {
                return (
                  <li
                    key={`reason-${reasonIndex}`}
                    className={styles.evidenceSourceItem}
                    title={evidenceFields(reason.evidence)[0]?.value ?? ''}
                  >
                    <span className={styles.evidenceSourceType}>{reason.evidenceType}</span>
                    <span className={styles.evidenceSourceDesc}>{reason.summary}</span>
                  </li>
                );
              }
              return (
                <li key={`reason-${reasonIndex}`} className={styles.reasonRelationship}>
                  Derived from {reason.sourceName ?? reason.sourceTechnology} (
                  {reason.relationshipType})
                </li>
              );
            })}
          </ul>
        ) : null}

        {explainability.noDirectEvidence ? (
          <p className={styles.noEvidence}>No direct evidence available.</p>
        ) : null}
      </section>

      {explainability.evidenceCount > 0 && (
        <footer className={styles.detectionMeta}>
          <span className={styles.evidenceCount}>
            {explainability.evidenceCount} evidence{' '}
            {explainability.evidenceCount === 1 ? 'item' : 'items'}
          </span>
          {/* Step 80 — minimal provenance surface: a deterministic "signals" line
              proving the `DetectionResponse.provenance` contract is consumable.
              Shows the post-dedup evidence count + the distinct evidence types
              (canonical order) as human-readable labels. Omitted when the
              detection carries no direct evidence (e.g. relationship-derived). */}
          {detection.provenance ? (
            <span
              className={styles.provenanceSignals}
              title="Evidence types supporting this detection"
            >
              {detection.provenance.evidenceCount} signal
              {detection.provenance.evidenceCount === 1 ? '' : 's'} —{' '}
              {detection.provenance.evidenceTypes.map(evidenceTypeLabel).join(', ')}
            </span>
          ) : null}
        </footer>
      )}

      {/* Step 72 — version conflict detail: render the disagreeing evidence
          rather than a silent placeholder. NOTE: per-observation versions are
          not persisted on the detection, so we surface the disagreeing
          evidence's source modality + matched value (see §13 LIMITATIONS). */}
      {versionConflict &&
      explainability.versionConflictDetail &&
      explainability.versionConflictDetail.length > 0 ? (
        <section className={styles.versionConflictDetail}>
          <h3 className={styles.versionConflictHeading}>Version evidence is inconsistent</h3>
          <ul className={styles.versionConflictEvidenceList}>
            {explainability.versionConflictDetail.map((detail, detailIndex) => (
              <li key={`vc-${detailIndex}`} className={styles.versionConflictEvidenceItem}>
                <span className={styles.versionConflictSource}>{detail.source}</span>
                <ul className={styles.versionConflictValues}>
                  {detail.evidence.map((ev, evIndex) => (
                    <li key={`vcv-${detailIndex}-${evIndex}`} title={ev.value}>
                      {ev.value}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <EvidenceList evidence={explainability.evidence} />
    </li>
  );
}
