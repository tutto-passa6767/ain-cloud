import { Injectable } from '@nestjs/common';
import { notFound } from './errors';
import { PrismaService } from './prisma.service';

/**
 * Единая точка проверки прав на материалы и папки (защита от IDOR, ТЗ §10.1).
 * Чужой объект отвечает 404, а не 403 — чтобы не раскрывать сам факт его существования.
 * В первой версии права — у владельца; командные роли и общий доступ добавятся сюда же.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async asset(userId: string, assetId: string, opts: { includeDeleted?: boolean } = {}) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        ownerId: userId,
        state: { not: 'UPLOADING' },
        ...(opts.includeDeleted ? {} : { deletedAt: null }),
      },
      include: { derivatives: true, tags: { include: { tag: true } } },
    });
    if (!asset) throw notFound('Файл');
    return asset;
  }

  async folder(userId: string, folderId: string, opts: { includeDeleted?: boolean } = {}) {
    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, ownerId: userId, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
    });
    if (!folder) throw notFound('Папка');
    return folder;
  }
}
