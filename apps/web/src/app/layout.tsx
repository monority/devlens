import type { ReactNode } from 'react';

export const metadata = {
  title: 'DevLens',
  description: 'DevLens — website analysis tool',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
