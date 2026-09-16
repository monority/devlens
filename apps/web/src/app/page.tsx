import Link from 'next/link';
import styles from './page.module.css';

export default function HomePage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>DevLens</h1>
      <p className={styles.subtitle}>Website analysis tool — foundation phase</p>
      <Link href="/technologies" className={styles.techCatalogLink}>
        Technology catalog
      </Link>
    </main>
  );
}
