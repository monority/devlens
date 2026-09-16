/**
 * GET /technologies — Technology catalog page.
 *
 * Server component that fetches all technologies from the in-memory
 * catalog and passes them to the `TechnologyCatalogView` client component
 * for client-side search and category filtering.
 *
 * Architecture (Step 31):
 *
 *   server page
 *       ↓
 *       catalog from existing source (getTechnologies())
 *       ↓
 *       client filter controls (TechnologyCatalogView + TechnologyFilters)
 *       ↓
 *       pure in-memory filtering (filterTechnologies())
 *
 * The browser must not request the catalog again.
 *
 * Navigation: each technology links to `/technologies/{id}` for the detail page.
 */

import Link from 'next/link';
import { getTechnologies } from '@/lib/technology-catalog';
import { TechnologyCatalogView } from '@/components/TechnologyCatalogView';
import styles from './page.module.css';

export default async function TechnologiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}): Promise<React.ReactElement> {
  // searchParams is consumed by TechnologyCatalogView (client) for URL state sync.
  // Here we await it so the server waits for it to be available.
  await searchParams;

  const technologies = getTechnologies();

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>DevLens</h1>
        <p className={styles.subtitle}>Technology Catalog</p>
      </div>

      <TechnologyCatalogView technologies={technologies} />

      <div className={styles.footer}>
        <Link href="/scans" className={styles.backLink}>
          ← Back to scan history
        </Link>
      </div>
    </main>
  );
}
