import type { NextConfig } from 'next';

// Запросы /api/* проксируются на NestJS — браузер работает с одним доменом, cookie сессии httpOnly
const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // Интерфейс рабочей части полностью клиентский (данные — через SWR после проверки сессии),
  // поэтому Cache Components / Partial Prefetching не используются
  cacheComponents: false,
  poweredByHeader: false,
  output: 'standalone',
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
