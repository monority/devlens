/**
 * ThemeProvider — client-side theme provider using next-themes.
 *
 * Wraps the application to provide dark/light mode toggling with
 * localStorage persistence and SSR-safe rendering (no flash of wrong
 * theme on initial load).
 *
 * Usage in layout.tsx:
 * ```tsx
 * <Providers>
 *   <GlobalNav />
 *   {children}
 * </Providers>
 * ```
 */
'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
