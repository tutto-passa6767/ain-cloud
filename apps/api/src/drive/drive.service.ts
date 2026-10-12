import { Injectable } from '@nestjs/common';
import type { Prisma } from '@ain/db';
import { AppError } from '../common/errors';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../common/prisma.service';
import { AssetPresenter } from './asset.presenter';
import { cleanName, FoldersService } from './folders.service';

export type SortKey = 'name' | 'size' | 'createdAt' | 'kind' | 'takenAt';

const assetOrder = (sort: SortKey, order: 'asc' | 'desc'): Prisma.AssetOrderByWithRelationInput[] => {
  switch (sort) {
    case 'size':
      return [{ size: order }, { name: 'asc' }];
    case 'createdAt':
      return [{ createdAt: order }];
    case 'kind':
      return [{ kind: order }, { name: 'asc' }];
    case 'takenAt':
      return [{ takenAt: { sort: order, nulls: 'last' } }, { createdAt: order }];
    default:
      return [{ name: order }];
  }
};

/** Материал виден в каталоге после завершения передачи и пока не в корзине */
const VISIBLE = { deletedAt: null, state: { not: 'UPLOADING' as const } };

@Injectable()
export class DriveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly folders: FoldersService,
    private readonly presenter: AssetPresenter,
  ) {}

  private presentFolder(f: { id: string; name: string; parentId: string | null; color: string | null; starred: boolean; createdAt: Date; updatedAt: Date; deletedAt?: Date | null }) {
    return { type: 'folder' as const, id: f.id, name: f.name, parentId: f.parentId, color: f.color, starred: f.starred, createdAt: f.createdAt, updatedAt: f.updatedAt, deletedAt: f.deletedAt ?? null };
  }

  async list(ownerId: string, folderId: string | null, sort: SortKey, order: 'asc' | 'desc') {
    const folder = folderId ? await this.access.folder(ownerId, folderId) : null;
    const [folders, assets, path] = await Promise.all([
      this.prisma.folder.findMany({
        where: { ownerId, parentId: folderId, deletedAt: null },
        orderBy: { name: sort === 'name' ? order : 'asc' },
      }),
      this.prisma.asset.findMany({
        where: { ownerId, folderId, ...VISIBLE },
        include: { derivatives: true, tags: { include: { tag: true } } },
        orderBy: assetOrder(sort, order),
      }),
      folderId ? this.folders.path(ownerId, folderId) : Promise.resolve([]),
    ]);
    return {
      folder: folder ? this.presentFolder(folder) : null,
      path,
      folders: folders.map((f) => this.presentFolder(f)),
      assets: await Promise.all(assets.map((a) => this.presenter.card(a))),
    };
  }

  /** Недавние: последние открытые и загруженные (ТЗ §5) */
  async recent(ownerId: string) {
    const assets = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Asset"
      WHERE "ownerId" = ${ownerId}::uuid AND "deletedAt" IS NULL AND state <> 'UPLOADING'
      ORDER BY GREATEST(COALESCE("lastOpenedAt", 'epoch'), "createdAt") DESC
      LIMIT 100`;
    const rows = await this.prisma.asset.findMany({
      where: { id: { in: assets.map((a) => a.id) } },
      include: { derivatives: true, tags: { include: { tag: true } } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return { assets: await Promise.all(assets.map((a) => this.presenter.card(byId.get(a.id)!))) };
  }

  async starred(ownerId: string) {
    const [folders, assets] = await Promise.all([
      this.prisma.folder.findMany({ where: { ownerId, starred: true, deletedAt: null }, orderBy: { name: 'asc' } }),
      this.prisma.asset.findMany({
        where: { ownerId, starred: true, ...VISIBLE },
        include: { derivatives: true, tags: { include: { tag: true } } },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { folders: folders.map((f) => this.presentFolder(f)), assets: await Promise.all(assets.map((a) => this.presenter.card(a))) };
  }

  async detail(ownerId: string, assetId: string, markOpened: boolean) {
    const asset = await this.access.asset(ownerId, assetId);
    if (markOpened) {
      await this.prisma.asset.update({ where: { id: assetId }, data: { lastOpenedAt: new Date() } });
    }
    const path = asset.folderId ? await this.folders.path(ownerId, asset.folderId) : [];
    return { asset: await this.presenter.detail(asset, { isOwner: asset.ownerId === ownerId }), path };
  }

  /** Переименование меняет только отображаемое название — не содержимое и не ключ объекта (ТЗ §2) */
  async update(ownerId: string, assetId: string, dto: { name?: string; description?: string; starred?: boolean; color?: string | null; folderId?: string | null; tags?: string[] }) {
    await this.access.asset(ownerId, assetId);
    const data: Prisma.AssetUpdateInput = {};
    if (dto.name !== undefined) data.name = cleanName(dto.name);
    if (dto.description !== undefined) data.description = dto.description.slice(0, 5000);
    if (dto.starred !== undefined) data.starred = dto.starred;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.folderId !== undefined) {
      if (dto.folderId) await this.access.folder(ownerId, dto.folderId);
      data.folder = dto.folderId ? { connect: { id: dto.folderId } } : { disconnect: true };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.asset.update({ where: { id: assetId }, data });
      if (dto.tags) {
        const names = [...new Set(dto.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 30);
        await tx.assetTag.deleteMany({ where: { assetId } });
        for (const name of names) {
          if (name.length > 50) throw new AppError(400, 'TAG_TOO_LONG', 'Тег длиннее 50 символов');
          const tag = await tx.tag.upsert({ where: { ownerId_name: { ownerId, name } }, update: {}, create: { ownerId, name } });
          await tx.assetTag.create({ data: { assetId, tagId: tag.id } });
        }
      }
    });
    return this.detail(ownerId, assetId, false);
  }

  async trashAsset(ownerId: string, assetId: string) {
    await this.access.asset(ownerId, assetId);
    await this.prisma.asset.update({ where: { id: assetId }, data: { deletedAt: new Date(), trashRootId: assetId } });
  }

  /** Групповые действия над выделением (ТЗ §5: перемещение, теги, удаление) */
  async bulk(ownerId: string, dto: { assetIds: string[]; folderIds: string[]; action: 'move' | 'trash' | 'star' | 'unstar'; targetFolderId?: string | null }) {
    // Проверяем права на каждый объект: чужие идентификаторы дают 404 для всей операции
    for (const id of dto.assetIds) await this.access.asset(ownerId, id);
    for (const id of dto.folderIds) await this.access.folder(ownerId, id);

    switch (dto.action) {
      case 'trash':
        for (const id of dto.folderIds) {
          // Вложенная папка могла уже уйти в корзину вместе с родителем из того же выделения
          const alive = await this.prisma.folder.count({ where: { id, ownerId, deletedAt: null } });
          if (alive) await this.folders.trash(ownerId, id);
        }
        // Файл, уже попавший в корзину вместе с удалённой папкой, не трогаем
        for (const id of dto.assetIds) {
          await this.prisma.asset.updateMany({ where: { id, ownerId, deletedAt: null }, data: { deletedAt: new Date(), trashRootId: id } });
        }
        break;
      case 'move': {
        const target = dto.targetFolderId ?? null;
        if (target) await this.access.folder(ownerId, target);
        for (const id of dto.folderIds) await this.folders.update(ownerId, id, { parentId: target });
        await this.prisma.asset.updateMany({ where: { id: { in: dto.assetIds }, ownerId }, data: { folderId: target } });
        break;
      }
      case 'star':
      case 'unstar': {
        const starred = dto.action === 'star';
        await this.prisma.asset.updateMany({ where: { id: { in: dto.assetIds }, ownerId }, data: { starred } });
        await this.prisma.folder.updateMany({ where: { id: { in: dto.folderIds }, ownerId }, data: { starred } });
        break;
      }
    }
  }
}
