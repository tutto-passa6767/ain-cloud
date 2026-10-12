import { createReadStream, createWriteStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { cfg } from './config';

export const s3 = new S3Client({
  endpoint: cfg.s3.endpoint,
  region: cfg.s3.region,
  forcePathStyle: true,
  credentials: { accessKeyId: cfg.s3.accessKey, secretAccessKey: cfg.s3.secretKey },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export async function getStream(bucket: string, key: string, range?: string): Promise<Readable> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }));
  return res.Body as Readable;
}

/** Ссылка для FFmpeg/ffprobe: читают оригинал по HTTP с перемоткой, не копируя 50 ГБ на диск */
export function internalUrl(bucket: string, key: string, ttlSec = 12 * 3600) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSec });
}

export async function download(bucket: string, key: string, path: string) {
  await pipeline(await getStream(bucket, key), createWriteStream(path));
}

export async function putFile(bucket: string, key: string, path: string, contentType: string) {
  const { size } = await stat(path);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(path),
      ContentLength: size,
      ContentType: contentType,
    }),
  );
  return size;
}

const MIME: Record<string, string> = {
  m3u8: 'application/vnd.apple.mpegurl',
  m4s: 'video/iso.segment',
  mp4: 'video/mp4',
  ts: 'video/mp2t',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/** Загрузить каталог целиком (HLS) под префиксом; возвращает суммарный размер */
export async function putDir(bucket: string, prefix: string, dir: string): Promise<number> {
  let total = 0;
  const walk = async (d: string) => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const rel = relative(dir, full).split('\\').join('/');
        const ext = entry.name.split('.').pop() ?? '';
        total += await putFile(bucket, `${prefix}${rel}`, full, MIME[ext] ?? 'application/octet-stream');
      }
    }
  };
  await walk(dir);
  return total;
}

export async function deletePrefix(bucket: string, prefix: string) {
  let token: string | undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    const keys = (res.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}
