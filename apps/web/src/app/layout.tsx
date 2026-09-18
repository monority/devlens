import type { ReactNode } from 'react';
import { GlobalNav } from '@/components/GlobalNav';

export const metadata = {
  title: 'DevLens',
  description: 'DevLens — website analysis tool',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <GlobalNav />
        {children}
      </body>
    </html>
  );
}
