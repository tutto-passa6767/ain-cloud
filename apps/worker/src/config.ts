import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(__dirname, '../../../.env'), quiet: true });

const req = (key: string, fallback?: string) => {
  const v = process.env[key];
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Не задана переменная окружения ${key}`);
};
const num = (key: string, fallback: number) => (process.env[key] ? Number(process.env[key]) : fallback);

export const cfg = {
  redisUrl: req('REDIS_URL', 'redis://localhost:56379'),
  s3: {
    endpoint: req('S3_ENDPOINT'),
    region: req('S3_REGION', 'us-east-1'),
    accessKey: req('S3_ACCESS_KEY'),
    secretKey: req('S3_SECRET_KEY'),
    originals: req('S3_BUCKET_ORIGINALS', 'ain-originals'),
    derived: req('S3_BUCKET_DERIVED', 'ain-derived'),
  },
  clamav: { host: req('CLAMAV_HOST', 'localhost'), port: num('CLAMAV_PORT', 3310) },
  /** Больше этого размера антивирус проверить не может — файл получает «Ограничен» */
  avMaxBytes: num('AV_MAX_SCAN_MB', 2000) * 1024 * 1024,
  workDir: req('WORK_DIR', '/tmp/ain-work'),
  processConcurrency: num('WORKER_CONCURRENCY', 1),
  verifyConcurrency: num('VERIFY_CONCURRENCY', 2),
  /** h264 — совместимо со всеми браузерами; hevc экономит место (ТЗ §7.2) */
  videoCodec: req('VIDEO_CODEC', 'h264') as 'h264' | 'hevc',
  /** libx264/libx265 на CPU или h264_nvenc/hevc_nvenc на GPU (ТЗ §7.4) */
  videoEncoder: req('VIDEO_ENCODER', ''),
  x264Preset: req('X264_PRESET', 'veryfast'),
  hlsSegmentSec: num('HLS_SEGMENT_SEC', 6),
  spriteIntervalSec: num('SPRITE_INTERVAL_SEC', 5),
  uploadSessionTtlDays: num('UPLOAD_SESSION_TTL_DAYS', 7),
  trashRetentionDays: num('TRASH_RETENTION_DAYS', 30),
  /** Ограничения на дочерние процессы обработки */
  toolTimeoutMs: num('TOOL_TIMEOUT_MIN', 360) * 60_000,
};
