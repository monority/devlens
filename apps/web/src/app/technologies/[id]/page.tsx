/**
 * GET /technologies/:id — Technology detail page.
 *
 * Server component that renders a single technology's detail page.
 * Uses `notFound()` for unknown technology IDs.
 *
 * Metadata: page `<title>` is `DevLens — {Technology Name}`, derived
 * from the catalog. Unknown IDs get a generic "not found" title —
 * no arbitrary user-controlled IDs are leaked into metadata.
 *
 * This page is pure — it reads from the in-memory catalog, no API or
 * database calls.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTechnologyById } from '@/lib/technology-catalog';
import styles from './page.module.css';

/**
 * Server-side metadata generation.
 *
 * Derives the page title from the technology name. Falls back to a
 * generic title for unknown IDs — does not leak the raw ID into metadata.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const tech = getTechnologyById(id);
  if (tech === null) {
    return {
      title: 'DevLens — Technology Not Found',
      description: 'The requested technology was not found in the DevLens catalog.',
    };
  }
  return {
    title: `DevLens — ${tech.name}`,
    description: tech.description,
  };
}

export default async function TechnologyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const tech = getTechnologyById(id);

  if (tech === null) {
    notFound();
  }

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>{tech.name}</h1>
        <p className={styles.subtitle}>
          ID: <code className={styles.techId}>{tech.id}</code>
        </p>
      </div>

      <div className={styles.detail}>
        <dl className={styles.detailMeta}>
          <div>
            <dt>Category</dt>
            <dd>{tech.category}</dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd>{tech.description}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.footer}>
        <Link href="/technologies" className={styles.backLink}>
          ← Back to technology catalog
        </Link>
      </div>
    </main>
  );
}
