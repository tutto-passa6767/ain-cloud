import { createHash } from 'node:crypto';
import type { Asset, PrismaClient } from '@ain/db';
import { scanStream } from './clamav';
import { cfg } from './config';
import { getStream } from './s3';
import { run } from './tools';

/**
 * Допустимые типы по содержимому для каждого расширения (ТЗ §10.1: фактический тип по содержимому,
 * а не по имени и Content-Type). Офисные форматы — это ZIP-контейнеры, поэтому application/zip допустим.
 */
const ACCEPTED_MIME: Record<string, string[]> = {
  mp4: ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/3gpp'],
  mov: ['video/quicktime', 'video/mp4'],
  mkv: ['video/x-matroska', 'video/webm', 'application/x-matroska'],
  avi: ['video/x-msvideo', 'video/avi', 'video/msvideo'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  heic: ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'],
  heif: ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'],
  tif: ['image/tiff'],
  tiff: ['image/tiff'],
  dng: ['image/tiff', 'image/x-adobe-dng'],
  cr2: ['image/x-canon-cr2', 'image/tiff'],
  cr3: ['image/x-canon-cr3', 'video/quicktime', 'video/mp4'],
  nef: ['image/x-nikon-nef', 'image/tiff'],
  arw: ['image/x-sony-arw', 'image/tiff'],
  mp3: ['audio/mpeg', 'audio/mp3'],
  wav: ['audio/x-wav', 'audio/wav', 'audio/vnd.wave'],
  flac: ['audio/flac', 'audio/x-flac'],
  m4a: ['audio/x-m4a', 'audio/mp4', 'video/mp4'],
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip'],
  zip: ['application/zip'],
};

/** Пересчёт SHA-256 по объекту в хранилище и захват первых байтов для определения типа */
async function hashObject(key: string): Promise<{ sha256: string; size: number; head: Buffer }> {
  const hash = createHash('sha256');
  const headParts: Buffer[] = [];
  let headLen = 0;
  let size = 0;
  for await (const chunk of await getStream(cfg.s3.originals, key)) {
    const buf = chunk as Buffer;
    hash.update(buf);
    size += buf.length;
    if (headLen < 256 * 1024) {
      headParts.push(buf.subarray(0, 256 * 1024 - headLen));
      headLen += Math.min(buf.length, 256 * 1024 - headLen);
    }
  }
  return { sha256: hash.digest('hex'), size, head: Buffer.concat(headParts) };
}

async function detectMime(head: Buffer): Promise<string> {
  const r = await run('file', ['--brief', '--mime-type', '-'], { input: head, timeoutMs: 30_000 });
  return r.stdout.trim() || 'application/octet-stream';
}

export type VerifyOutcome = 'VERIFIED' | 'RESTRICTED' | 'BLOCKED' | 'CORRUPTED';

/**
 * Шаги 2–4 жизненного цикла (ТЗ §7.1): сверка контрольной суммы → проверка безопасности →
 * «Проверен» / «Ограничен» / «Заблокирован». Непроверенный файл не получает статус «Проверен».
 */
export async function verifyAsset(prisma: PrismaClient, asset: Asset, log: (m: string) => void): Promise<VerifyOutcome> {
  const setState = (state: VerifyOutcome | 'SCANNING', reason: string | null, extra: Record<string, unknown> = {}) =>
    prisma.asset.update({ where: { id: asset.id }, data: { state, stateReason: reason, stateChangedAt: new Date(), ...extra } });

  // 1. Контрольная сумма: оригинал в хранилище должен совпасть побайтово с тем, что отправил браузер
  const { sha256, size, head } = await hashObject(asset.objectKey);
  if (BigInt(size) !== asset.size) {
    await setState('CORRUPTED', `SIZE_MISMATCH: ожидалось ${asset.size}, в хранилище ${size}`, { sha256 });
    return 'CORRUPTED';
  }
  if (asset.sha256Client && asset.sha256Client !== sha256) {
    await setState('CORRUPTED', 'CHECKSUM_MISMATCH', { sha256 });
    log(`контрольная сумма не совпала: клиент ${asset.sha256Client}, хранилище ${sha256}`);
    return 'CORRUPTED';
  }
  await setState('SCANNING', null, { sha256 });

  // 2. Тип по содержимому
  const mime = await detectMime(head);
  const accepted = ACCEPTED_MIME[asset.extension];
  await prisma.asset.update({ where: { id: asset.id }, data: { detectedMime: mime } });
  if (!accepted || !accepted.includes(mime)) {
    await setState('BLOCKED', `TYPE_MISMATCH: содержимое ${mime} не соответствует расширению .${asset.extension}`);
    return 'BLOCKED';
  }

  // 3. Антивирус. Больше технического предела ClamAV проверить нельзя → «Ограничен» (ТЗ §10.1)
  if (size > cfg.avMaxBytes) {
    await setState('RESTRICTED', `AV_SIZE_LIMIT: файл больше ${Math.round(cfg.avMaxBytes / 1048576)} МБ — антивирусная проверка невозможна`);
    return 'RESTRICTED';
  }
  const result = await scanStream(await getStream(cfg.s3.originals, asset.objectKey));
  if (result.status === 'clean') {
    await setState('VERIFIED', null, { scanEngine: result.engine });
    return 'VERIFIED';
  }
  if (result.status === 'infected') {
    await setState('BLOCKED', `MALWARE: ${result.signature}`, { scanEngine: result.engine });
    return 'BLOCKED';
  }
  await setState('RESTRICTED', `AV_ERROR: ${result.reason}`.slice(0, 500));
  return 'RESTRICTED';
}
