import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// Локально настройки берутся из корневого .env; в контейнере — из переменных окружения.
loadEnv({ path: resolve(__dirname, '../../../.env'), quiet: true });

const str = (key: string, fallback?: string): string => {
  const v = process.env[key];
  if (v !== undefined && v !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Не задана переменная окружения ${key}`);
};
const num = (key: string, fallback: number): number => {
  const v = process.env[key];
  return v ? Number(v) : fallback;
};
const bool = (key: string, fallback: boolean): boolean => {
  const v = process.env[key];
  return v ? v === 'true' || v === '1' : fallback;
};

const MiB = 1024 * 1024;

export const cfg = {
  port: num('API_PORT', 4000),
  appUrl: str('APP_URL', 'http://localhost:3000'),
  cookieSecure: bool('COOKIE_SECURE', false),
  /** Секрет для подписи cookie доступа к ссылкам с паролем */
  appSecret: str('APP_SECRET'),
  sessionTtlDays: num('SESSION_TTL_DAYS', 30),
  redisUrl: str('REDIS_URL', 'redis://localhost:56379'),
  s3: {
    endpoint: str('S3_ENDPOINT'),
    publicEndpoint: str('S3_PUBLIC_ENDPOINT', process.env.S3_ENDPOINT),
    region: str('S3_REGION', 'us-east-1'),
    accessKey: str('S3_ACCESS_KEY'),
    secretKey: str('S3_SECRET_KEY'),
    bucketOriginals: str('S3_BUCKET_ORIGINALS', 'ain-originals'),
    bucketDerived: str('S3_BUCKET_DERIVED', 'ain-derived'),
  },
  smtp: {
    host: str('SMTP_HOST', 'localhost'),
    port: num('SMTP_PORT', 51025),
    secure: bool('SMTP_SECURE', false),
    user: process.env.SMTP_USER || undefined,
    password: process.env.SMTP_PASSWORD || undefined,
    from: str('MAIL_FROM', 'AIN Cloud <no-reply@ain.kz>'),
  },
  upload: {
    partSize: num('UPLOAD_PART_SIZE_MB', 64) * MiB,
    parallelParts: num('UPLOAD_PARALLEL_PARTS', 4),
    sessionTtlDays: num('UPLOAD_SESSION_TTL_DAYS', 7),
  },
  /** Срок жизни подписанных ссылок на загрузку частей и скачивание (ТЗ §9: 5–15 мин) */
  signedUrlTtlSec: num('SIGNED_URL_TTL_SEC', 900),
  isProduction: process.env.NODE_ENV === 'production',
};
