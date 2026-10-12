import { Injectable } from '@nestjs/common';
import type { AssetKind, AssetState, Prisma, ProcessingState } from '@ain/db';
import { PrismaService } from '../common/prisma.service';
import { AssetPresenter } from './asset.presenter';

export interface SearchFilters {
  q?: string;
  kind?: AssetKind;
  state?: AssetState;
  processing?: ProcessingState;
  folderId?: string;
  uploadedFrom?: Date;
  uploadedTo?: Date;
  takenFrom?: Date;
  takenTo?: Date;
  minSize?: number;
  maxSize?: number;
  minHeight?: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Поиск видит только то, к чему у пользователя есть доступ (ТЗ §8):
 * условие по владельцу стоит в каждом запросе, включая подсказки.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenter: AssetPresenter,
  ) {}

  private where(ownerId: string, f: SearchFilters): Prisma.AssetWhereInput {
    const and: Prisma.AssetWhereInput[] = [{ ownerId, deletedAt: null, state: { not: 'UPLOADING' } }];
    const q = f.q?.trim();
    if (q) {
      const like = { contains: escapeLike(q), mode: 'insensitive' as const };
      and.push({ OR: [{ name: like }, { originalName: like }, { description: like }, { tags: { some: { tag: { name: like } } } }] });
    }
    if (f.kind) and.push({ kind: f.kind });
    if (f.state) and.push({ state: f.state });
    if (f.processing) and.push({ processing: f.processing });
    if (f.folderId) and.push({ folderId: f.folderId });
    if (f.uploadedFrom || f.uploadedTo) and.push({ createdAt: { gte: f.uploadedFrom, lte: f.uploadedTo } });
    if (f.takenFrom || f.takenTo) and.push({ takenAt: { gte: f.takenFrom, lte: f.takenTo } });
    if (f.minSize !== undefined || f.maxSize !== undefined) {
      and.push({ size: { gte: f.minSize !== undefined ? BigInt(f.minSize) : undefined, lte: f.maxSize !== undefined ? BigInt(f.maxSize) : undefined } });
    }
    if (f.minHeight) and.push({ OR: [{ height: { gte: f.minHeight } }, { width: { gte: f.minHeight } }] });
    return { AND: and };
  }

  async search(ownerId: string, f: SearchFilters) {
    const q = f.q?.trim();
    const [assets, folders] = await Promise.all([
      this.prisma.asset.findMany({
        where: this.where(ownerId, f),
        include: { derivatives: true, tags: { include: { tag: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      q && !f.kind && !f.state && !f.processing
        ? this.prisma.folder.findMany({
            where: { ownerId, deletedAt: null, name: { contains: escapeLike(q), mode: 'insensitive' } },
            orderBy: { name: 'asc' },
            take: 50,
          })
        : Promise.resolve([]),
    ]);
    return {
      folders: folders.map((x) => ({ type: 'folder' as const, id: x.id, name: x.name, parentId: x.parentId, color: x.color, starred: x.starred, createdAt: x.createdAt, updatedAt: x.updatedAt })),
      assets: await Promise.all(assets.map((a) => this.presenter.card(a))),
    };
  }

  /** Подсказки по названиям и тегам — тоже только из доступного */
  async suggest(ownerId: string, q: string) {
    const term = q.trim();
    if (term.length < 2) return { items: [] };
    const like = { contains: escapeLike(term), mode: 'insensitive' as const };
    const [assets, tags] = await Promise.all([
      this.prisma.asset.findMany({
        where: { ownerId, deletedAt: null, state: { not: 'UPLOADING' }, name: like },
        select: { id: true, name: true, kind: true },
        take: 6,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tag.findMany({ where: { ownerId, name: like, assets: { some: { asset: { deletedAt: null } } } }, select: { name: true }, take: 4 }),
    ]);
    return {
      items: [
        ...assets.map((a) => ({ type: 'asset' as const, id: a.id, label: a.name, kind: a.kind })),
        ...tags.map((t) => ({ type: 'tag' as const, label: t.name })),
      ],
    };
  }
}
