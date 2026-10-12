import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { DerivativeKind, Prisma, PrismaClient } from '@ain/db';
import { cfg } from '../config';
import { putFile } from '../s3';
import { run, runOk } from '../tools';

export const derivedKey = (assetId: string, name: string) => `a/${assetId}/${name}`;

/** Временный каталог задачи; удаляется после обработки в любом случае */
export async function withWorkDir<T>(assetId: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = join(cfg.workDir, `${assetId}-${randomUUID().slice(0, 8)}`);
  await mkdir(dir, { recursive: true });
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function saveDerivative(
  prisma: PrismaClient,
  assetId: string,
  kind: DerivativeKind,
  file: string,
  mime: string,
  extra: { width?: number; height?: number; meta?: Prisma.InputJsonValue; name?: string } = {},
) {
  const key = derivedKey(assetId, extra.name ?? `${kind.toLowerCase()}.${file.split('.').pop()}`);
  const size = await putFile(cfg.s3.derived, key, file, mime);
  const data = { objectKey: key, mime, width: extra.width, height: extra.height, size: BigInt(size), meta: extra.meta };
  await prisma.derivative.upsert({
    where: { assetId_kind: { assetId, kind } },
    update: data,
    create: { assetId, kind, ...data },
  });
}

export async function imageSize(file: string): Promise<{ width: number; height: number }> {
  const r = await runOk('vipsheader', ['-f', 'width', file], { timeoutMs: 60_000 });
  const h = await runOk('vipsheader', ['-f', 'height', file], { timeoutMs: 60_000 });
  return { width: Number(r.stdout.trim()), height: Number(h.stdout.trim()) };
}

/**
 * Уменьшенная копия через libvips. Ориентация из EXIF применяется к производной версии,
 * оригинал не поворачивается и не обрезается (ТЗ §7.3). Увеличение не делается.
 */
export async function vipsResize(src: string, out: string, box: number, quality = 82) {
  await runOk('vipsthumbnail', [src, '--size', `${box}x${box}>`, '-o', `${out}[Q=${quality},strip]`], { timeoutMs: 10 * 60_000 });
  return imageSize(out);
}

/** Миниатюры 256 и 1024 px (ТЗ §7.3) — для карточек и списков */
export async function makeThumbs(prisma: PrismaClient, assetId: string, src: string, dir: string) {
  const sm = join(dir, 'thumb_sm.webp');
  const lg = join(dir, 'thumb_lg.webp');
  const smSize = await vipsResize(src, sm, 256, 78);
  await saveDerivative(prisma, assetId, 'THUMB_SM', sm, 'image/webp', smSize);
  const lgSize = await vipsResize(src, lg, 1024, 82);
  await saveDerivative(prisma, assetId, 'THUMB_LG', lg, 'image/webp', lgSize);
}

export async function fileExists(path: string) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

// ---------- EXIF ----------

const SENSITIVE = /^(GPS|SerialNumber$|InternalSerialNumber|LensSerialNumber|CameraSerialNumber|BodySerialNumber|OwnerName|Artist$|CameraOwnerName)/;
const EXIF_PUBLIC = [
  'Make', 'Model', 'LensModel', 'LensID', 'ISO', 'ExposureTime', 'FNumber', 'FocalLength', 'FocalLengthIn35mmFormat',
  'ExposureCompensation', 'ExposureProgram', 'MeteringMode', 'Flash', 'WhiteBalance', 'Orientation', 'ColorSpace',
  'ImageWidth', 'ImageHeight', 'BitsPerSample', 'Software', 'DateTimeOriginal', 'OffsetTimeOriginal', 'CreateDate',
];

export interface ExifInfo {
  exif: Record<string, unknown>;
  sensitive: Record<string, unknown>;
  takenAt: Date | null;
}

/**
 * Дата съёмки из EXIF; если её нет — null, дата загрузки не подставляется (ТЗ §8).
 * Хранится «время на камере» как есть (смещение пояса, если есть, остаётся в EXIF OffsetTimeOriginal).
 */
export function parseExifDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!m || m[1] === '0000') return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function readExif(file: string): Promise<ExifInfo> {
  const r = await run('exiftool', ['-json', '-n', '-charset', 'filename=utf8', file], { timeoutMs: 120_000 });
  let all: Record<string, unknown> = {};
  try {
    all = (JSON.parse(r.stdout) as Record<string, unknown>[])[0] ?? {};
  } catch {
    return { exif: {}, sensitive: {}, takenAt: null };
  }
  const exif: Record<string, unknown> = {};
  const sensitive: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) {
    if (SENSITIVE.test(k)) sensitive[k] = v;
    else if (EXIF_PUBLIC.includes(k)) exif[k] = v;
  }
  const takenAt = parseExifDate(all.DateTimeOriginal) ?? parseExifDate(all.CreateDate);
  return { exif, sensitive, takenAt };
}
