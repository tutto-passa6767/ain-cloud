import type { NextConfig } from 'next';

// Запросы /api/* проксируются на NestJS — браузер работает с одним доменом, cookie сессии httpOnly
// На Vercel API подключается отдельно; localhost доступен только при локальном запуске.
const API = process.env.API_INTERNAL_URL || (process.env.VERCEL ? undefined : 'http://localhost:4000');

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
    return API ? [{ source: '/api/:path*', destination: `${API.replace(/\/$/, '')}/api/:path*` }] : [];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
