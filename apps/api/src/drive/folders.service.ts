import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../common/prisma.service';

export function cleanName(raw: string): string {
  // Убираем управляющие символы и разделители путей; пустое имя недопустимо
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '_').trim();
  if (!name || name === '.' || name === '..') throw new AppError(400, 'INVALID_NAME', 'Недопустимое имя');
  if (name.length > 255) throw new AppError(400, 'NAME_TOO_LONG', 'Имя длиннее 255 символов');
  return name;
}

@Injectable()
export class FoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async create(ownerId: string, rawName: string, parentId: string | null) {
    const name = cleanName(rawName);
    if (parentId) await this.access.folder(ownerId, parentId);
    return this.prisma.folder.create({ data: { ownerId, name, parentId } });
  }

  /** Найти или создать вложенную папку по пути — для загрузки целых папок (ТЗ §6.1) */
  async ensurePath(ownerId: string, parentId: string | null, segments: string[]) {
    let current = parentId;
    if (current) await this.access.folder(ownerId, current);
    for (const raw of segments) {
      const name = cleanName(raw);
      const existing = await this.prisma.folder.findFirst({
        where: { ownerId, parentId: current, name, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      current = existing ? existing.id : (await this.prisma.folder.create({ data: { ownerId, name, parentId: current } })).id;
    }
    return current;
  }

  /** Цепочка от корня до папки для навигационной цепочки */
  async path(ownerId: string, folderId: string): Promise<{ id: string; name: string }[]> {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; depth: number }[]>`
      WITH RECURSIVE chain AS (
        SELECT id, name, "parentId", 0 AS depth FROM "Folder" WHERE id = ${folderId}::uuid AND "ownerId" = ${ownerId}::uuid
        UNION ALL
        SELECT f.id, f.name, f."parentId", c.depth + 1 FROM "Folder" f JOIN chain c ON f.id = c."parentId"
      )
      SELECT id, name, depth FROM chain ORDER BY depth DESC`;
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  /** Идентификаторы папки и всех вложенных папок */
  async subtreeIds(folderId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT id FROM "Folder" WHERE id = ${folderId}::uuid
        UNION ALL
        SELECT f.id FROM "Folder" f JOIN tree t ON f."parentId" = t.id
      )
      SELECT id FROM tree`;
    return rows.map((r) => r.id);
  }

  async update(ownerId: string, id: string, dto: { name?: string; parentId?: string | null; starred?: boolean; color?: string | null }) {
    await this.access.folder(ownerId, id);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = cleanName(dto.name);
    if (dto.starred !== undefined) data.starred = dto.starred;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.parentId !== undefined) {
      if (dto.parentId) {
        await this.access.folder(ownerId, dto.parentId);
        const subtree = await this.subtreeIds(id);
        if (subtree.includes(dto.parentId)) {
          throw new AppError(400, 'MOVE_INTO_ITSELF', 'Нельзя переместить папку внутрь неё самой');
        }
      }
      data.parentId = dto.parentId;
    }
    return this.prisma.folder.update({ where: { id }, data });
  }

  /** В корзину вместе с содержимым; восстановление вернёт всю ветку целиком (ТЗ §10.4) */
  async trash(ownerId: string, id: string) {
    await this.access.folder(ownerId, id);
    const ids = await this.subtreeIds(id);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.folder.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: now, trashRootId: id } }),
      this.prisma.asset.updateMany({ where: { folderId: { in: ids }, deletedAt: null }, data: { deletedAt: now, trashRootId: id } }),
    ]);
  }

  /** Все папки пользователя — для дерева и диалога перемещения */
  async tree(ownerId: string) {
    return this.prisma.folder.findMany({
      where: { ownerId, deletedAt: null },
      select: { id: true, name: true, parentId: true, color: true, starred: true },
      orderBy: { name: 'asc' },
    });
  }
}
