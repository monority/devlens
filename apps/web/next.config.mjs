// Next.js configuration — foundation phase
const withBundleAnalyzer = (await import('@next/bundle-analyzer')).default;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Security: comprehensive headers applied to all responses.
  // X-Frame-Options prevents clickjacking. CSP restricts resource loading.
  // nosniff prevents MIME-type sniffing attacks.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: https:; " +
              "font-src 'self' data: https:; " +
              "connect-src 'self' https:; " +
              "frame-ancestors 'none'; " +
              "base-uri 'self'",
          },
        ],
      },
    ];
  },
};

// Bundle analyzer: only enabled when ANALYZE=true env var is set.
// Generates a treemap visualization of JS bundle composition.
export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})(nextConfig);
