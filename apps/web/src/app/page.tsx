/**
 * GET / — DevLens home/dashboard page.
 *
 * Server component that fetches scan history and the technology catalog
 * concurrently, then renders the `HomeDashboard` presentation component.
 *
 * Data loading:
 * - `fetchScans()` (GET /api/scans) — returns scan summaries ordered
 *   `createdAt DESC, scanId ASC` (newest first)
 * - `getTechnologies()` — returns the in-memory technology catalog
 *
 * Fetch failures for scans are handled gracefully: the home page still
 * renders the hero, quick actions, and technology summary. The recent
 * scans section shows an error message. The technology catalog is always
 * available (synchronous, in-memory).
 *
 * Navigation: each section links to its corresponding route:
 * - New Scan → /scans/new
 * - Scan History → /scans
 * - Technology Catalog → /technologies
 */

import { fetchScans } from '@/lib/api';
import { getTechnologies } from '@/lib/technology-catalog';
import { HomeDashboard } from '@/components/HomeDashboard';
import styles from './page.module.css';

export default async function HomePage(): Promise<React.ReactElement> {
  // Load both data sources concurrently — they are independent.
  const [scans, technologies] = await Promise.all([
    fetchScans()
      .then((r) => r.scans)
      .catch(() => null),
    Promise.resolve(getTechnologies()),
  ]);

  return (
    <main className={styles.main}>
      <HomeDashboard scans={scans} technologies={technologies} />
    </main>
  );
}
