import { Injectable } from '@nestjs/common';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  Part,
  S3Client,
  S3ClientConfig,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { cfg } from '../config';

const clientConfig = (endpoint: string): S3ClientConfig => ({
  endpoint,
  region: cfg.s3.region,
  forcePathStyle: true,
  credentials: { accessKeyId: cfg.s3.accessKey, secretAccessKey: cfg.s3.secretKey },
  // Браузер не может досчитать контрольные суммы SDK для подписанных ссылок — включаем их только когда обязательны
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

/** Имя файла для Content-Disposition: ASCII-запасной вариант + UTF-8 по RFC 6266 */
export function contentDisposition(kind: 'attachment' | 'inline', filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

@Injectable()
export class S3Service {
  /** Клиент для операций изнутри сети */
  readonly internal = new S3Client(clientConfig(cfg.s3.endpoint));
  /** Клиент для подписи ссылок, по которым ходит браузер (адрес хранилища, видимый снаружи) */
  readonly public = new S3Client(clientConfig(cfg.s3.publicEndpoint));

  readonly originals = cfg.s3.bucketOriginals;
  readonly derived = cfg.s3.bucketDerived;

  async createMultipart(key: string): Promise<string> {
    const res = await this.internal.send(
      new CreateMultipartUploadCommand({
        Bucket: this.originals,
        Key: key,
        // Тип по имени не доверяем: оригинал хранится как поток байтов, тип определяет воркер
        ContentType: 'application/octet-stream',
      }),
    );
    if (!res.UploadId) throw new Error('Хранилище не вернуло UploadId');
    return res.UploadId;
  }

  presignUploadPart(key: string, uploadId: string, partNumber: number, ttlSec: number) {
    return getSignedUrl(
      this.public,
      new UploadPartCommand({ Bucket: this.originals, Key: key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn: ttlSec },
    );
  }

  /** Все принятые хранилищем части (с постраничным обходом) */
  async listParts(key: string, uploadId: string): Promise<Part[]> {
    const parts: Part[] = [];
    let marker: string | undefined;
    do {
      const res = await this.internal.send(
        new ListPartsCommand({ Bucket: this.originals, Key: key, UploadId: uploadId, PartNumberMarker: marker, MaxParts: 1000 }),
      );
      parts.push(...(res.Parts ?? []));
      marker = res.IsTruncated ? res.NextPartNumberMarker : undefined;
    } while (marker);
    return parts.sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0));
  }

  async completeMultipart(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]) {
    await this.internal.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.originals,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  }

  async abortMultipart(key: string, uploadId: string) {
    try {
      await this.internal.send(new AbortMultipartUploadCommand({ Bucket: this.originals, Key: key, UploadId: uploadId }));
    } catch (e: any) {
      if (e?.name !== 'NoSuchUpload') throw e;
    }
  }

  async headOriginal(key: string): Promise<{ size: number } | null> {
    try {
      const res = await this.internal.send(new HeadObjectCommand({ Bucket: this.originals, Key: key }));
      return { size: Number(res.ContentLength ?? 0) };
    } catch (e: any) {
      if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  /**
   * Подписанная ссылка на чтение. Время подписи округляется до окна, чтобы ссылка
   * оставалась одинаковой и браузер мог кэшировать миниатюры.
   */
  presignGet(
    bucket: string,
    key: string,
    opts: { ttlSec: number; disposition?: string; contentType?: string; stableWindowSec?: number },
  ) {
    const now = Date.now();
    const windowMs = (opts.stableWindowSec ?? 0) * 1000;
    const signingDate = windowMs ? new Date(Math.floor(now / windowMs) * windowMs) : new Date(now);
    return getSignedUrl(
      this.public,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: opts.disposition,
        ResponseContentType: opts.contentType,
        ResponseCacheControl: windowMs ? 'private, max-age=3600' : 'private, no-store',
      }),
      // Срок отсчитывается от времени подписи: запас в одно окно гарантирует не меньше ttlSec
      { expiresIn: opts.ttlSec + (opts.stableWindowSec ?? 0), signingDate },
    );
  }

  async getText(bucket: string, key: string): Promise<string | null> {
    try {
      const res = await this.internal.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return (await res.Body?.transformToString('utf-8')) ?? null;
    } catch (e: any) {
      if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  async deleteObject(bucket: string, key: string) {
    await this.internal.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: [{ Key: key }], Quiet: true } }));
  }

  async deletePrefix(bucket: string, prefix: string) {
    let token: string | undefined;
    do {
      const res = await this.internal.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (res.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) {
        await this.internal.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }
}
