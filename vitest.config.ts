import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const req = createRequire(import.meta.url);
const esbuild = req('esbuild');

// Vitest/Vite plugin to transform JSX in .tsx files, overriding the web app's
// tsconfig `jsx: "preserve"` setting (which is reset by `next build` and is
// only intended for the Next.js SWC compiler, not for Vite/Vitest).
function jsxTransform() {
  return {
    name: 'vitest-tsx-jsx',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.endsWith('.tsx')) return null;
      const result = esbuild.transformSync(code, {
        loader: 'tsx',
        jsx: 'automatic',
        jsxImportSource: 'react',
        sourcefile: id,
      });
      return { code: result.code, map: result.map };
    },
  };
}

export default defineConfig({
  plugins: [jsxTransform()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'apps/web/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/src/**/*.{test,spec}.{ts,tsx}', 'apps/**/src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'lcov'],
      exclude: ['node_modules/', 'dist/', '.next/'],
    },
  },
});
