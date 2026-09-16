/**
 * ScanInsights — compact summary of technology usage derived from
 * an already-loaded `ScanDetailResponse`.
 *
 * This is a **pure presentation component** — it receives typed API
 * data as props and renders HTML. It does not fetch data, call APIs,
 * or access the database. All derived data is computed by the pure
 * `getScanInsights()` function in `lib/scan-insights.ts`.
 *
 * Displayed for **completed** scans only:
 * - Technology count ("N technologies detected")
 * - Category composition (compact list: "CMS · 3")
 * - Evidence coverage (total evidence items + source-type breakdown)
 * - Detected technologies list (known techs link to catalog)
 *
 * For failed / pending / running scans, returns `null` — preserving
 * the existing presentation of those states.
 */

import Link from 'next/link';
import { isKnownTechnology } from '@/lib/technology-catalog';
import { getScanInsights } from '@/lib/scan-insights';
import type { ScanDetailResponse } from '@/lib/types';
import styles from './ScanCard.module.css';

export interface ScanInsightsProps {
  result: ScanDetailResponse;
}

export function ScanInsights({ result }: ScanInsightsProps): React.ReactElement | null {
  const { scan, detections } = result;

  // Only display insights for completed scans.
  // Failed/pending/running scans use their existing presentation.
  if (scan.status !== 'completed') {
    return null;
  }

  const insights = getScanInsights(result);

  return (
    <section className={styles.scanInsights}>
      <h2>Technology Insights</h2>

      {/* Technology count */}
      <p className={styles.techCount}>
        {insights.technologyCount} technolog{insights.technologyCount === 1 ? 'y' : 'ies'} detected
      </p>

      {/* Category composition */}
      <div className={styles.categoryComposition}>
        <h3>Categories</h3>
        <ul className={styles.categoryList}>
          {insights.categories.map(({ category, count }) => (
            <li key={category} className={styles.categoryItem}>
              <span className={styles.categoryName}>{category}</span>
              <span className={styles.categoryCount}>· {count}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Evidence coverage */}
      <div className={styles.evidenceCoverage}>
        <h3>Evidence coverage</h3>
        <dl className={styles.evidenceMeta}>
          <div>
            <dt>Evidence items</dt>
            <dd>
              {insights.evidenceCount} item{insights.evidenceCount === 1 ? '' : 's'}
            </dd>
          </div>
          <div>
            <dt>Source types</dt>
            <dd>{insights.evidenceTypes.length}</dd>
          </div>
        </dl>
        <ul className={styles.evidenceTypeList}>
          {insights.evidenceTypes.map(({ type, count }) => (
            <li key={type} className={styles.evidenceTypeItem}>
              <span className={styles.evidenceTypeName}>{type}</span>
              <span className={styles.evidenceTypeCount}>· {count}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Detected technologies (with catalog links where known) */}
      {insights.technologyCount > 0 && (
        <div className={styles.techList}>
          <h3>Detected technologies</h3>
          <ul className={styles.techListItems}>
            {detections.map((detection, index) => {
              const tech = detection.technology;
              const known = isKnownTechnology(tech.id);
              return (
                <li key={`${tech.id}-${index}`} className={styles.techListItem}>
                  {known ? (
                    <Link
                      href={`/technologies/${encodeURIComponent(tech.id)}`}
                      className={styles.techInsightLink}
                    >
                      {tech.name}
                    </Link>
                  ) : (
                    <span className={styles.techName}>{tech.name}</span>
                  )}
                  <span className={styles.techCategory}>{known ? tech.category : 'Unknown'}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
