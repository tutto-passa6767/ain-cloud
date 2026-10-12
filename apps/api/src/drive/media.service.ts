import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { cfg } from '../config';
import { AccessService } from '../common/access.service';
import { AuditService } from '../common/audit.service';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { contentDisposition, S3Service } from '../common/s3.service';

/** Сегменты HLS: плейлист VOD запрашивается один раз, поэтому ссылки на сегменты живут дольше */
const SEGMENT_TTL = 6 * 3600;
const SEGMENT_WINDOW = 1800;

/** quality — короткая сторона кадра (2160, 1080…), чтобы вертикальное видео не обходило лимит тарифа */
type Rendition = { name: string; width: number; height: number; quality: number; bandwidth: number; codec?: string };

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly s3: S3Service,
    private readonly audit: AuditService,
  ) {}

  /**
   * Разрешение на скачивание оригинала (ТЗ §2, §7.1). Отдаётся именно исходный файл.
   * Непроверенный файл не выдаётся как безопасный: для «Ограничен» нужно явное подтверждение владельца.
   */
  async downloadUrl(userId: string, assetId: string, acknowledgeUnverified: boolean, req: Request) {
    const asset = await this.access.asset(userId, assetId);
    switch (asset.state) {
      case 'VERIFIED':
        break;
      case 'RESTRICTED':
        if (!acknowledgeUnverified) {
          throw new AppError(409, 'UNVERIFIED_ACK_REQUIRED', 'Файл не прошёл полную проверку безопасности', { reason: asset.stateReason });
        }
        break;
      case 'RECEIVED':
      case 'SCANNING':
        throw new AppError(409, 'NOT_YET_VERIFIED', 'Файл ещё проверяется');
      case 'CORRUPTED':
        throw new AppError(409, 'FILE_CORRUPTED', 'Контрольная сумма не совпала — загрузите файл заново');
      case 'BLOCKED':
        throw new AppError(403, 'FILE_BLOCKED', 'Файл заблокирован', { reason: asset.stateReason });
      default:
        throw new AppError(409, 'NOT_AVAILABLE', 'Файл недоступен');
    }
    const url = await this.s3.presignGet(this.s3.originals, asset.objectKey, {
      ttlSec: cfg.signedUrlTtlSec,
      disposition: contentDisposition('attachment', asset.originalName),
      contentType: 'application/octet-stream',
    });
    // Записываем выдачу ссылки — это не подтверждённое скачивание (ТЗ §10.3)
    await this.audit.record({
      action: 'download.url_issued',
      actorId: userId,
      targetType: 'asset',
      targetId: assetId,
      req,
      meta: { size: Number(asset.size), unverified: asset.state === 'RESTRICTED' },
    });
    return { url, expiresInSec: cfg.signedUrlTtlSec, fileName: asset.originalName, size: asset.size, sha256: asset.sha256 };
  }

  /** Прямое воспроизведение аудио из оригинала (браузер сам решает, умеет ли он этот формат) */
  async streamUrl(userId: string, assetId: string) {
    const asset = await this.access.asset(userId, assetId);
    if (asset.kind !== 'AUDIO') throw new AppError(400, 'NOT_STREAMABLE', 'Для этого типа файла поток недоступен');
    if (asset.state !== 'VERIFIED' && asset.state !== 'RESTRICTED') throw new AppError(409, 'NOT_AVAILABLE', 'Файл недоступен');
    const url = await this.s3.presignGet(this.s3.originals, asset.objectKey, {
      ttlSec: 3 * 3600,
      disposition: contentDisposition('inline', asset.originalName),
      contentType: asset.detectedMime ?? 'application/octet-stream',
    });
    return { url };
  }

  /** Допустимые качества: ограничены тарифом владельца файла, Free — до 1080p (ТЗ §4.2, §7.2) */
  private async hlsContext(asset: { ownerId: string; state: string; derivatives: { kind: string; objectKey: string; meta: unknown }[] }) {
    if (asset.state === 'BLOCKED') throw notFound('Видео');
    const hls = asset.derivatives.find((d) => d.kind === 'HLS');
    if (!hls) throw new AppError(409, 'NOT_READY', 'Видео ещё обрабатывается');
    const owner = await this.prisma.user.findUniqueOrThrow({ where: { id: asset.ownerId }, include: { plan: true } });
    const renditions = ((hls.meta as any)?.renditions ?? []) as Rendition[];
    const permitted = renditions.filter((r) => r.quality <= owner.plan.maxVideoHeight);
    if (!permitted.length && renditions.length) {
      permitted.push(renditions.reduce((m, r) => (r.quality < m.quality ? r : m)));
    }
    return { prefix: hls.objectKey, permitted };
  }

  async masterPlaylist(userId: string, assetId: string): Promise<string> {
    return this.masterFor(await this.access.asset(userId, assetId));
  }

  async variantPlaylist(userId: string, assetId: string, file: string): Promise<string> {
    return this.variantFor(await this.access.asset(userId, assetId), file, SEGMENT_TTL);
  }

  /** Главный плейлист: только разрешённые качества, адреса вариантов — относительные к API */
  async masterFor(asset: Parameters<MediaService['hlsContext']>[0]): Promise<string> {
    const { prefix, permitted } = await this.hlsContext(asset);
    const text = await this.s3.getText(this.s3.derived, `${prefix}master.m3u8`);
    if (!text) throw new AppError(409, 'NOT_READY', 'Видео ещё обрабатывается');
    const names = new Set(permitted.map((r) => r.name));
    const lines = text.split(/\r?\n/);
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const uri = lines[i + 1] ?? '';
        const name = uri.split('/')[0];
        i++;
        if (!names.has(name)) continue;
        out.push(line, `${name}.m3u8`);
        continue;
      }
      out.push(line);
    }
    return out.join('\n');
  }

  /** Плейлист варианта: сегменты и init — по подписанным ссылкам с ограниченным сроком */
  async variantFor(asset: Parameters<MediaService['hlsContext']>[0], file: string, ttlSec: number): Promise<string> {
    const m = /^(v\d{1,2})\.m3u8$/.exec(file);
    if (!m) throw notFound('Плейлист');
    const name = m[1];
    const { prefix, permitted } = await this.hlsContext(asset);
    if (!permitted.some((r) => r.name === name)) throw notFound('Плейлист');
    const text = await this.s3.getText(this.s3.derived, `${prefix}${name}/index.m3u8`);
    if (!text) throw notFound('Плейлист');

    const sign = (rel: string) =>
      this.s3.presignGet(this.s3.derived, `${prefix}${name}/${rel}`, { ttlSec, stableWindowSec: SEGMENT_WINDOW });

    const out: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('#EXT-X-MAP:')) {
        const uri = /URI="([^"]+)"/.exec(line)?.[1];
        out.push(uri ? line.replace(`URI="${uri}"`, `URI="${await sign(uri)}"`) : line);
      } else if (line && !line.startsWith('#')) {
        out.push(await sign(line.trim()));
      } else {
        out.push(line);
      }
    }
    return out.join('\n');
  }
}
