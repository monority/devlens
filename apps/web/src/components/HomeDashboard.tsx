/**
 * HomeDashboard — pure presentation component for the DevLens home/dashboard.
 *
 * Receives already-fetched data (scans + technologies) as props and
 * renders a professional, information-dense dashboard:
 *
 * 1. Hero / introduction — what DevLens does
 * 2. Quick actions — links to existing routes (/scans/new, /scans, /technologies)
 * 3. Recent scans — up to 5 most recent (newest first), rendered via ScanCard
 * 4. Technology catalog summary — total count + category distribution
 *
 * Pure component — no data fetching, no state, no hooks.
 * Data is fetched server-side by the page in `app/page.tsx`.
 *
 * Tested via `renderToString` from `react-dom/server` — no DOM environment
 * required, consistent with the existing node-based test setup.
 */

import Link from 'next/link';
import { ScanCard } from './ScanViews';
import type { ScanSummary } from '../lib/types.js';
import type { TechnologyPresentation } from '../lib/technology-catalog.js';
import pageStyles from '../app/page.module.css';
import cardStyles from './ScanCard.module.css';

export interface HomeDashboardProps {
  /** Scan summaries from the API (already ordered newest first).
   *  `null` indicates a fetch failure. */
  scans: ScanSummary[] | null;
  /** All known technologies from the in-memory catalog. */
  technologies: TechnologyPresentation[];
}

interface CategoryCount {
  category: string;
  count: number;
}

/**
 * Computes a sorted category distribution from the technology catalog.
 * Pure, deterministic — no network/database dependencies.
 */
function getCategoryCounts(technologies: TechnologyPresentation[]): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const tech of technologies) {
    counts.set(tech.category, (counts.get(tech.category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function HomeDashboard({ scans, technologies }: HomeDashboardProps): React.ReactElement {
  const recentScans = scans === null ? [] : scans.slice(0, 5);
  const categoryCounts = getCategoryCounts(technologies);

  return (
    <>
      {/* ── Hero / introduction ── */}
      <section className={pageStyles.hero}>
        <h1 className={pageStyles.title}>DevLens</h1>
        <p className={pageStyles.subtitle}>
          Analyze a website, detect its technologies, and inspect the evidence behind every
          detection.
        </p>
      </section>

      {/* ── Quick actions ── */}
      <section className={pageStyles.quickActions}>
        <h2 className={pageStyles.sectionTitle}>Get started</h2>
        <div className={pageStyles.actions}>
          <Link href="/scans/new" className={pageStyles.actionButton}>
            New Scan
          </Link>
          <Link href="/scans" className={pageStyles.actionLink}>
            Scan History
          </Link>
          <Link href="/technologies" className={pageStyles.actionLink}>
            Technology Catalog
          </Link>
        </div>
      </section>

      {/* ── Recent scans ── */}
      <section className={pageStyles.recentSection}>
        <div className={pageStyles.sectionHeader}>
          <h2 className={pageStyles.sectionTitle}>Recent scans</h2>
          {scans !== null && scans.length > 5 && (
            <Link href="/scans" className={pageStyles.viewAllLink}>
              View all {scans.length} scans →
            </Link>
          )}
        </div>

        {scans === null ? (
          <p className={pageStyles.scanError}>Unable to load scan history.</p>
        ) : recentScans.length === 0 ? (
          <>
            <p className={pageStyles.scanEmpty}>
              No scans yet. Scans will appear here after creation.
            </p>
            <Link href="/scans/new" className={pageStyles.actionLink}>
              Create your first scan →
            </Link>
          </>
        ) : (
          <div className={cardStyles.cards}>
            {recentScans.map((scan) => (
              <ScanCard key={scan.id} scan={scan} />
            ))}
          </div>
        )}
      </section>

      {/* ── Technology catalog summary ── */}
      <section className={pageStyles.techSummary}>
        <h2 className={pageStyles.sectionTitle}>Technology catalog</h2>
        <p className={pageStyles.techTotal}>{technologies.length} technologies tracked</p>
        <dl className={pageStyles.categoryCounts}>
          {categoryCounts.map(({ category, count }) => (
            <div key={category} className={pageStyles.categoryItem}>
              <dt className={pageStyles.categoryName}>{category}</dt>
              <dd className={pageStyles.categoryCount}>{count}</dd>
            </div>
          ))}
        </dl>
        <Link href="/technologies" className={pageStyles.catalogLink}>
          View all technologies →
        </Link>
      </section>
    </>
  );
}
