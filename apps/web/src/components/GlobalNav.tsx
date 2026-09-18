/**
 * GlobalNav — persistent application navigation header.
 *
 * A small, isolated client component that renders a semantic `<header>`
 * with a primary `<nav>` containing:
 *
 * - DevLens brand link → `/`
 * - Scans → `/scans`
 * - New Scan → `/scans/new`
 * - Technologies → `/technologies`
 *
 * Active-section state is computed via `usePathname` (from next/navigation)
 * and exposed semantically via `aria-current="page"`. This component is
 * the ONLY client boundary introduced for navigation — the layout itself
 * remains a server component.
 *
 * Navigation sections:
 * - `/`             → Home
 * - `/scans`, `/scans/*` → Scans
 * - `/technologies`, `/technologies/*` → Technologies
 */

'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import styles from './GlobalNav.module.css';

const navItems: { label: string; href: string }[] = [
  { label: 'Scans', href: '/scans' },
  { label: 'New Scan', href: '/scans/new' },
  { label: 'Technologies', href: '/technologies' },
];

/**
 * Determines whether the given href represents the current section.
 *
 * - `/` is active only on the exact home route.
 * - `/scans` is active on `/scans` and all sub-paths (`/scans/new`,
 *   `/scans/{id}`, `/scans/compare`).
 * - `/technologies` is active on `/technologies` and all sub-paths.
 */
function isSectionActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(href + '/');
}

export function GlobalNav(): React.ReactElement {
  const pathname = usePathname();

  return (
    <header className={styles.navContainer}>
      <nav aria-label="Primary">
        <Link
          href="/"
          className={styles.brand}
          aria-current={pathname === '/' ? 'page' : undefined}
        >
          DevLens
        </Link>
        <ul className={styles.navList}>
          {navItems.map(({ label, href }) => {
            const active = isSectionActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={active ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
                  aria-current={active ? 'page' : undefined}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
