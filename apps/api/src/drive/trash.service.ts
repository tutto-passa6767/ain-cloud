import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { S3Service } from '../common/s3.service';
import { SettingsService } from '../common/settings.service';
import { AssetPresenter } from './asset.presenter';

/**
 * Корзина (ТЗ §10.4): удалённое хранится N дней и восстанавливается вместе со связями.
 * Корзина не считается резервной копией.
 */
@Injectable()
export class TrashService {
  private readonly log = new Logger('Trash');

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly settings: SettingsService,
    private readonly presenter: AssetPresenter,
    private readonly audit: AuditService,
  ) {}

  async list(ownerId: string) {
    const days = await this.settings.get('trash.retentionDays', 30);
    const purgeAt = (d: Date | null) => (d ? new Date(d.getTime() + days * 86400_000) : null);
    const [folders, assets] = await Promise.all([
      this.prisma.folder.findMany({ where: { ownerId, deletedAt: { not: null }, trashRootId: { not: null } }, orderBy: { deletedAt: 'desc' } }),
      this.prisma.asset.findMany({
        where: { ownerId, deletedAt: { not: null }, state: { not: 'UPLOADING' }, trashRootId: { not: null } },
        include: { derivatives: true, tags: { include: { tag: true } } },
        orderBy: { deletedAt: 'desc' },
      }),
    ]);
    // Показываем только корни удалённых веток; содержимое удалённой папки восстанавливается вместе с ней
    const rootFolders = folders.filter((f) => f.trashRootId === f.id);
    const rootAssets = assets.filter((a) => a.trashRootId === a.id);
    const itemsInFolder = new Map<string, number>();
    for (const a of assets) if (a.trashRootId !== a.id) itemsInFolder.set(a.trashRootId!, (itemsInFolder.get(a.trashRootId!) ?? 0) + 1);
    return {
      retentionDays: days,
      folders: rootFolders.map((f) => ({
        type: 'folder' as const, id: f.id, name: f.name, deletedAt: f.deletedAt, purgeAt: purgeAt(f.deletedAt), files: itemsInFolder.get(f.id) ?? 0,
      })),
      assets: await Promise.all(rootAssets.map(async (a) => ({ ...(await this.presenter.card(a)), purgeAt: purgeAt(a.deletedAt) }))),
    };
  }

  async restore(ownerId: string, folderIds: string[], assetIds: string[], req: Request) {
    for (const id of folderIds) {
      const f = await this.prisma.folder.findFirst({ where: { id, ownerId, trashRootId: id } });
      if (!f) continue;
      // Если родительской папки больше нет, ветка возвращается в корень
      const parentAlive = f.parentId ? await this.prisma.folder.count({ where: { id: f.parentId, deletedAt: null } }) : 1;
      await this.prisma.$transaction([
        this.prisma.folder.updateMany({ where: { ownerId, trashRootId: id }, data: { deletedAt: null, trashRootId: null } }),
        this.prisma.asset.updateMany({ where: { ownerId, trashRootId: id }, data: { deletedAt: null, trashRootId: null } }),
        ...(parentAlive ? [] : [this.prisma.folder.update({ where: { id }, data: { parentId: null } })]),
      ]);
      await this.audit.record({ action: 'trash.restore', actorId: ownerId, targetType: 'folder', targetId: id, req });
    }
    for (const id of assetIds) {
      const a = await this.prisma.asset.findFirst({ where: { id, ownerId, trashRootId: id } });
      if (!a) continue;
      const folderAlive = a.folderId ? await this.prisma.folder.count({ where: { id: a.folderId, deletedAt: null } }) : 1;
      await this.prisma.asset.update({
        where: { id },
        data: { deletedAt: null, trashRootId: null, ...(folderAlive ? {} : { folderId: null }) },
      });
      await this.audit.record({ action: 'trash.restore', actorId: ownerId, targetType: 'asset', targetId: id, req });
    }
  }

  /** Окончательное удаление: оригинал и производные версии удаляются из хранилища, место освобождается */
  async purge(ownerId: string, folderIds: string[], assetIds: string[], req?: Request) {
    const roots = [...folderIds, ...assetIds];
    if (!roots.length) return { purged: 0 };
    const assets = await this.prisma.asset.findMany({ where: { ownerId, trashRootId: { in: roots }, deletedAt: { not: null } } });
    let freed = 0n;
    for (const a of assets) {
      await this.s3.deleteObject(this.s3.originals, a.objectKey);
      await this.s3.deletePrefix(this.s3.derived, `a/${a.id}/`);
      await this.prisma.$transaction([
        this.prisma.asset.delete({ where: { id: a.id } }),
        this.prisma.user.update({ where: { id: ownerId }, data: { usedBytes: { decrement: a.size } } }),
      ]);
      freed += a.size;
    }
    // Папки удаляются от вложенных к родительским
    const folders = await this.prisma.folder.findMany({ where: { ownerId, trashRootId: { in: folderIds }, deletedAt: { not: null } } });
    const remaining = new Set(folders.map((f) => f.id));
    while (remaining.size) {
      const leaves = folders.filter((f) => remaining.has(f.id) && !folders.some((c) => remaining.has(c.id) && c.parentId === f.id));
      if (!leaves.length) break;
      await this.prisma.folder.deleteMany({ where: { id: { in: leaves.map((l) => l.id) } } });
      leaves.forEach((l) => remaining.delete(l.id));
    }
    await this.audit.record({
      action: 'trash.purge',
      actorId: ownerId,
      req,
      meta: { assets: assets.length, folders: folders.length, freedBytes: Number(freed) },
    });
    return { purged: assets.length };
  }

  async empty(ownerId: string, req: Request) {
    const [folders, assets] = await Promise.all([
      this.prisma.folder.findMany({ where: { ownerId, deletedAt: { not: null } }, select: { id: true, trashRootId: true } }),
      this.prisma.asset.findMany({ where: { ownerId, deletedAt: { not: null }, state: { not: 'UPLOADING' } }, select: { id: true, trashRootId: true } }),
    ]);
    return this.purge(
      ownerId,
      folders.filter((f) => f.trashRootId === f.id).map((f) => f.id),
      assets.filter((a) => a.trashRootId === a.id).map((a) => a.id),
      req,
    );
  }
}
