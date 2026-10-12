import { Injectable } from '@nestjs/common';
import type { Prisma } from '@ain/db';
import { S3Service } from '../common/s3.service';

export type AssetWithRelations = Prisma.AssetGetPayload<{
  include: { derivatives: true; tags: { include: { tag: true } } };
}>;

type AssetLite = Prisma.AssetGetPayload<{ include: { derivatives: true } }> & { tags?: { tag: { name: string } }[] };

/** Миниатюры подписываются со «стабильным окном», чтобы браузер кэшировал их между запросами */
const THUMB_TTL = 3600;
const THUMB_WINDOW = 1800;

@Injectable()
export class AssetPresenter {
  constructor(private readonly s3: S3Service) {}

  private async derivativeUrl(asset: AssetLite, kind: string) {
    const d = asset.derivatives.find((x) => x.kind === kind);
    if (!d) return null;
    return this.s3.presignGet(this.s3.derived, d.objectKey, {
      ttlSec: THUMB_TTL,
      stableWindowSec: THUMB_WINDOW,
      contentType: d.mime ?? undefined,
    });
  }

  /** Карточка для сетки и списка: строится из миниатюр, оригинал не скачивается (ТЗ §5) */
  async card(asset: AssetLite) {
    // Заблокированный файл не показываем даже миниатюрой
    const showThumbs = asset.state !== 'BLOCKED';
    return {
      id: asset.id,
      type: 'asset' as const,
      name: asset.name,
      extension: asset.extension,
      kind: asset.kind,
      size: asset.size,
      folderId: asset.folderId,
      state: asset.state,
      stateReason: asset.stateReason,
      processing: asset.processing,
      processingProgress: asset.processingProgress,
      width: asset.width,
      height: asset.height,
      durationSec: asset.durationSec,
      takenAt: asset.takenAt,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      deletedAt: asset.deletedAt,
      starred: asset.starred,
      color: asset.color,
      tags: (asset.tags ?? []).map((t) => t.tag.name),
      thumbSm: showThumbs ? await this.derivativeUrl(asset, 'THUMB_SM') : null,
      thumbLg: showThumbs ? await this.derivativeUrl(asset, 'THUMB_LG') : null,
      // Короткое анимированное превью видео — показывается при наведении на карточку
      animated: showThumbs && asset.kind === 'VIDEO' ? await this.derivativeUrl(asset, 'ANIMATED') : null,
    };
  }

  /** Полная карточка для страницы файла */
  async detail(asset: AssetWithRelations, opts: { isOwner: boolean }) {
    const base = await this.card(asset);
    const blocked = asset.state === 'BLOCKED';
    const sprite = asset.derivatives.find((d) => d.kind === 'SPRITE');
    const hls = asset.derivatives.find((d) => d.kind === 'HLS');
    return {
      ...base,
      originalName: asset.originalName,
      description: asset.description,
      detectedMime: asset.detectedMime,
      sha256: asset.sha256,
      sha256Client: asset.sha256Client,
      processingError: asset.processingError,
      meta: asset.meta,
      exif: asset.exif,
      // GPS и серийные номера — только владельцу (ТЗ §8)
      sensitiveMeta: opts.isOwner ? asset.sensitiveMeta : null,
      preview: blocked ? null : await this.derivativeUrl(asset, 'PREVIEW'),
      animated: blocked ? null : await this.derivativeUrl(asset, 'ANIMATED'),
      sprite:
        sprite && !blocked
          ? { url: await this.derivativeUrl(asset, 'SPRITE'), ...(sprite.meta as Record<string, number>) }
          : null,
      hls: hls && !blocked ? { renditions: (hls.meta as any)?.renditions ?? [] } : null,
      lastOpenedAt: asset.lastOpenedAt,
    };
  }
}
