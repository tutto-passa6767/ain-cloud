import { AbortMultipartUploadCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@ain/db';
import { cfg } from './config';
import { deletePrefix, s3 } from './s3';

/**
 * Периодическое обслуживание:
 * — просроченные незавершённые загрузки отменяются, резерв квоты снимается (ТЗ §6.4);
 * — содержимое корзины старше срока хранения удаляется окончательно (ТЗ §10.4).
 */
export async function housekeeping(prisma: PrismaClient, log: (scope: string, msg: string) => void) {
  const now = new Date();

  const expired = await prisma.uploadSession.findMany({ where: { status: 'ACTIVE', expiresAt: { lt: now } }, take: 500 });
  for (const s of expired) {
    const claimed = await prisma.uploadSession.updateMany({ where: { id: s.id, status: 'ACTIVE' }, data: { status: 'EXPIRED' } });
    if (!claimed.count) continue;
    await s3.send(new AbortMultipartUploadCommand({ Bucket: cfg.s3.originals, Key: s.objectKey, UploadId: s.s3UploadId })).catch(() => undefined);
    await prisma.$executeRaw`UPDATE "User" SET "reservedBytes" = GREATEST("reservedBytes" - ${s.reservedBytes}, 0) WHERE id = ${s.userId}::uuid`;
    await prisma.asset.update({ where: { id: s.assetId }, data: { deletedAt: now } });
  }
  if (expired.length) log('housekeeping', `отменено просроченных загрузок: ${expired.length}`);

  const settings = await prisma.setting.findUnique({ where: { key: 'trash.retentionDays' } });
  const days = Number(settings?.value ?? cfg.trashRetentionDays);
  const cutoff = new Date(now.getTime() - days * 86400_000);
  const assets = await prisma.asset.findMany({
    where: { deletedAt: { lt: cutoff }, trashRootId: { not: null }, state: { not: 'UPLOADING' } },
    take: 500,
  });
  for (const a of assets) {
    await s3.send(new DeleteObjectsCommand({ Bucket: cfg.s3.originals, Delete: { Objects: [{ Key: a.objectKey }], Quiet: true } }));
    await deletePrefix(cfg.s3.derived, `a/${a.id}/`);
    await prisma.$transaction([
      prisma.asset.delete({ where: { id: a.id } }),
      prisma.$executeRaw`UPDATE "User" SET "usedBytes" = GREATEST("usedBytes" - ${a.size}, 0) WHERE id = ${a.ownerId}::uuid`,
    ]);
    await prisma.auditEvent.create({ data: { action: 'trash.auto_purge', targetType: 'asset', targetId: a.id, meta: { size: Number(a.size) } } });
  }
  // Папки корзины без содержимого удаляются после файлов
  const folders = await prisma.folder.deleteMany({
    where: { deletedAt: { lt: cutoff }, assets: { none: {} }, children: { none: {} } },
  });
  if (assets.length || folders.count) log('housekeeping', `очищено из корзины: файлов ${assets.length}, папок ${folders.count}`);
}
