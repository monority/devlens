import type { ReactNode } from 'react';
import { GlobalNav } from '@/components/GlobalNav';
import { ThemeProvider } from '@/providers/theme-provider';
import '@/app/globals.css';

export const metadata = {
  title: 'DevLens',
  description: 'DevLens — website analysis tool',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <GlobalNav />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
