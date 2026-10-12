import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { ShareLink } from '@ain/db';
import { cfg } from '../config';
import { AccessService } from '../common/access.service';
import { AuditService } from '../common/audit.service';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { contentDisposition, S3Service } from '../common/s3.service';
import { AssetPresenter } from '../drive/asset.presenter';
import { FoldersService } from '../drive/folders.service';
import { MediaService } from '../drive/media.service';

/** Гостевые ссылки на сегменты видео живут меньше, чем у владельца: отзыв действует быстрее */
const GUEST_SEGMENT_TTL = 2 * 3600;
const UNLOCK_TTL_MS = 12 * 3600_000;

export interface CreateShareInput {
  assetId?: string;
  folderId?: string;
  password?: string;
  expiresAt?: Date;
  maxDownloads?: number;
  viewOnly?: boolean;
}

const unlockCookie = (shareId: string) => `ain_share_${shareId.slice(0, 8)}`;

@Injectable()
export class SharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly folders: FoldersService,
    private readonly presenter: AssetPresenter,
    private readonly media: MediaService,
    private readonly s3: S3Service,
    private readonly audit: AuditService,
  ) {}

  presentForOwner(s: ShareLink) {
    return {
      id: s.id,
      url: `${cfg.appUrl}/s/${s.token}`,
      token: s.token,
      assetId: s.assetId,
      folderId: s.folderId,
      hasPassword: !!s.passwordHash,
      expiresAt: s.expiresAt,
      maxDownloads: s.maxDownloads,
      viewOnly: s.viewOnly,
      opens: s.opens,
      downloadsIssued: s.downloadsIssued,
      lastOpenedAt: s.lastOpenedAt,
      revokedAt: s.revokedAt,
      blockedAt: s.blockedAt,
      blockedReason: s.blockedReason,
      createdAt: s.createdAt,
    };
  }

  // ---------- владелец ----------

  async create(ownerId: string, input: CreateShareInput, req: Request) {
    if (!!input.assetId === !!input.folderId) throw new AppError(400, 'BAD_REQUEST', 'Укажите файл или папку');
    if (input.assetId) {
      const a = await this.access.asset(ownerId, input.assetId);
      if (a.state === 'BLOCKED' || a.state === 'CORRUPTED') throw new AppError(409, 'FILE_BLOCKED', 'Этим файлом нельзя поделиться');
    } else {
      await this.access.folder(ownerId, input.folderId!);
    }
    // Пароль, срок, лимит и «только просмотр» — возможности Pro (ТЗ §9, §16)
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ownerId }, include: { plan: true } });
    const advanced = !!input.password || !!input.expiresAt || input.maxDownloads !== undefined || !!input.viewOnly;
    if (advanced && !(user.plan.features as Record<string, boolean>).passwordLinks) {
      throw new AppError(403, 'PLAN_FEATURE_REQUIRED', 'Пароль, срок и лимит ссылок доступны на тарифе Pro', { feature: 'passwordLinks' });
    }
    if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
      throw new AppError(400, 'INVALID_EXPIRY', 'Срок действия должен быть в будущем');
    }
    const share = await this.prisma.shareLink.create({
      data: {
        token: randomBytes(16).toString('base64url'),
        ownerId,
        assetId: input.assetId,
        folderId: input.folderId,
        passwordHash: input.password ? await argon2.hash(input.password, { type: argon2.argon2id }) : null,
        expiresAt: input.expiresAt,
        maxDownloads: input.maxDownloads,
        viewOnly: !!input.viewOnly,
      },
    });
    await this.audit.record({
      action: 'share.created',
      actorId: ownerId,
      targetType: input.assetId ? 'asset' : 'folder',
      targetId: input.assetId ?? input.folderId,
      req,
      meta: { shareId: share.id, password: !!input.password, expiresAt: input.expiresAt ?? null, maxDownloads: input.maxDownloads ?? null, viewOnly: !!input.viewOnly },
    });
    return this.presentForOwner(share);
  }

  async list(ownerId: string, filter: { assetId?: string; folderId?: string }) {
    const rows = await this.prisma.shareLink.findMany({
      where: { ownerId, assetId: filter.assetId, folderId: filter.folderId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { items: rows.map((s) => this.presentForOwner(s)) };
  }

  async revoke(ownerId: string, id: string, req: Request) {
    const s = await this.prisma.shareLink.findFirst({ where: { id, ownerId } });
    if (!s) throw notFound('Ссылка');
    if (!s.revokedAt) await this.prisma.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.record({ action: 'share.revoked', actorId: ownerId, targetType: 'share', targetId: id, req });
    return { ok: true };
  }

  // ---------- гость ----------

  private sign(shareId: string, exp: number) {
    return createHmac('sha256', cfg.appSecret).update(`${shareId}.${exp}`).digest('base64url');
  }

  private isUnlocked(share: ShareLink, req: Request) {
    if (!share.passwordHash) return true;
    const raw = req.cookies?.[unlockCookie(share.id)] as string | undefined;
    if (!raw) return false;
    const [exp, sig] = raw.split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    const expected = Buffer.from(this.sign(share.id, Number(exp)));
    const got = Buffer.from(sig);
    return expected.length === got.length && timingSafeEqual(expected, got);
  }

  /** Проверка условий ссылки: отозвана, истекла, заблокирована модератором, владелец заблокирован */
  async resolve(token: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new AppError(404, 'SHARE_NOT_FOUND', 'Ссылка не найдена');
    const share = await this.prisma.shareLink.findUnique({ where: { token }, include: { owner: { select: { name: true, blockedAt: true } } } });
    if (!share || share.owner.blockedAt) throw new AppError(404, 'SHARE_NOT_FOUND', 'Ссылка не найдена');
    if (share.revokedAt) throw new AppError(410, 'SHARE_REVOKED', 'Владелец закрыл доступ по этой ссылке');
    if (share.blockedAt) throw new AppError(451, 'SHARE_BLOCKED', 'Доступ по ссылке заблокирован');
    if (share.expiresAt && share.expiresAt < new Date()) throw new AppError(410, 'SHARE_EXPIRED', 'Срок действия ссылки истёк');
    return share;
  }

  private async resolveUnlocked(token: string, req: Request) {
    const share = await this.resolve(token);
    if (!this.isUnlocked(share, req)) throw new AppError(401, 'SHARE_PASSWORD_REQUIRED', 'Введите пароль ссылки');
    return share;
  }

  async meta(token: string, req: Request) {
    const share = await this.resolve(token);
    const unlocked = this.isUnlocked(share, req);
    // Открытие учитывается в статистике владельца; это не подтверждение скачивания
    await this.prisma.shareLink.update({ where: { id: share.id }, data: { opens: { increment: 1 }, lastOpenedAt: new Date() } });
    await this.audit.record({ action: 'share.opened', targetType: 'share', targetId: share.id, req });
    let name: string | null = null;
    if (unlocked) {
      name = share.assetId
        ? (await this.prisma.asset.findFirst({ where: { id: share.assetId, deletedAt: null }, select: { name: true } }))?.name ?? null
        : (await this.prisma.folder.findFirst({ where: { id: share.folderId!, deletedAt: null }, select: { name: true } }))?.name ?? null;
      if (!name) throw new AppError(404, 'SHARE_NOT_FOUND', 'Файл по ссылке удалён');
    }
    return {
      type: share.assetId ? 'asset' : 'folder',
      requiresPassword: !!share.passwordHash && !unlocked,
      viewOnly: share.viewOnly,
      expiresAt: share.expiresAt,
      ownerName: share.owner.name,
      name,
      downloadsLeft: share.maxDownloads !== null ? Math.max(0, share.maxDownloads - share.downloadsIssued) : null,
    };
  }

  async unlock(token: string, password: string, req: Request, res: import('express').Response) {
    const share = await this.resolve(token);
    if (!share.passwordHash) return { ok: true };
    const ok = await argon2.verify(share.passwordHash, password).catch(() => false);
    await this.audit.record({ action: ok ? 'share.unlocked' : 'share.unlock_failed', targetType: 'share', targetId: share.id, req });
    if (!ok) throw new AppError(401, 'SHARE_WRONG_PASSWORD', 'Неверный пароль');
    const exp = Date.now() + UNLOCK_TTL_MS;
    res.cookie(unlockCookie(share.id), `${exp}.${this.sign(share.id, exp)}`, {
      httpOnly: true,
      secure: cfg.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: UNLOCK_TTL_MS,
    });
    return { ok: true };
  }

  /** Материал внутри области ссылки: сам файл или любой файл из расшаренной папки и её подпапок */
  private async assetInScope(share: ShareLink, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, ownerId: share.ownerId, deletedAt: null, state: { in: ['VERIFIED', 'RESTRICTED'] } },
      include: { derivatives: true, tags: { include: { tag: true } } },
    });
    if (!asset) throw notFound('Файл');
    if (share.assetId) {
      if (asset.id !== share.assetId) throw notFound('Файл');
    } else {
      if (!asset.folderId) throw notFound('Файл');
      const subtree = await this.folders.subtreeIds(share.folderId!);
      if (!subtree.includes(asset.folderId)) throw notFound('Файл');
    }
    return asset;
  }

  async content(token: string, folderId: string | undefined, req: Request) {
    const share = await this.resolveUnlocked(token, req);
    if (share.assetId) {
      const asset = await this.assetInScope(share, share.assetId);
      return { asset: await this.guestAsset(asset) };
    }
    // Папка: можно ходить только внутри расшаренной ветки
    const root = share.folderId!;
    const current = folderId ?? root;
    const subtree = await this.folders.subtreeIds(root);
    if (!subtree.includes(current)) throw notFound('Папка');
    const [folder, folders, assets] = await Promise.all([
      this.prisma.folder.findFirst({ where: { id: current, deletedAt: null } }),
      this.prisma.folder.findMany({ where: { parentId: current, deletedAt: null }, orderBy: { name: 'asc' } }),
      this.prisma.asset.findMany({
        where: { folderId: current, deletedAt: null, state: { in: ['VERIFIED', 'RESTRICTED'] } },
        include: { derivatives: true, tags: { include: { tag: true } } },
        orderBy: { name: 'asc' },
      }),
    ]);
    if (!folder) throw notFound('Папка');
    const fullPath = await this.folders.path(share.ownerId, current);
    const rootIdx = fullPath.findIndex((p) => p.id === root);
    return {
      folder: { id: folder.id, name: folder.name },
      path: fullPath.slice(rootIdx),
      folders: folders.map((f) => ({ type: 'folder' as const, id: f.id, name: f.name, parentId: f.parentId, color: f.color, starred: false, createdAt: f.createdAt, updatedAt: f.updatedAt })),
      assets: await Promise.all(assets.map(async (a) => ({ ...(await this.presenter.card(a)), starred: false, tags: [] }))),
    };
  }

  async asset(token: string, assetId: string, req: Request) {
    const share = await this.resolveUnlocked(token, req);
    return { asset: await this.guestAsset(await this.assetInScope(share, assetId)) };
  }

  /** Гостю не показываются служебные и чувствительные поля: GPS, серийные номера, контрольные суммы клиента */
  private async guestAsset(asset: Awaited<ReturnType<SharesService['assetInScope']>>) {
    const d = await this.presenter.detail(asset, { isOwner: false });
    return { ...d, description: d.description, tags: [], starred: false, sensitiveMeta: null, sha256Client: null, stateReason: null, processingError: null };
  }

  async master(token: string, assetId: string, req: Request) {
    const share = await this.resolveUnlocked(token, req);
    return this.media.masterFor(await this.assetInScope(share, assetId));
  }

  async variant(token: string, assetId: string, file: string, req: Request) {
    const share = await this.resolveUnlocked(token, req);
    return this.media.variantFor(await this.assetInScope(share, assetId), file, GUEST_SEGMENT_TTL);
  }

  /**
   * Скачивание оригинала гостем: не в режиме «только просмотр», в пределах лимита,
   * и только проверенный файл — «Ограниченный» гостю не выдаётся (ТЗ §7.1).
   */
  async download(token: string, assetId: string, req: Request) {
    const share = await this.resolveUnlocked(token, req);
    if (share.viewOnly) throw new AppError(403, 'SHARE_VIEW_ONLY', 'По этой ссылке доступен только просмотр');
    const asset = await this.assetInScope(share, assetId);
    if (asset.state !== 'VERIFIED') throw new AppError(403, 'NOT_VERIFIED', 'Файл не прошёл полную проверку безопасности и не выдаётся по ссылке');
    // Лимит считается атомарно, параллельные запросы его не обходят
    const claimed = await this.prisma.$executeRaw`
      UPDATE "ShareLink" SET "downloadsIssued" = "downloadsIssued" + 1
      WHERE id = ${share.id}::uuid AND ("maxDownloads" IS NULL OR "downloadsIssued" < "maxDownloads")`;
    if (!claimed) throw new AppError(429, 'SHARE_LIMIT_REACHED', 'Лимит скачиваний по ссылке исчерпан');
    const url = await this.s3.presignGet(this.s3.originals, asset.objectKey, {
      ttlSec: cfg.signedUrlTtlSec,
      disposition: contentDisposition('attachment', asset.originalName),
      contentType: 'application/octet-stream',
    });
    await this.audit.record({ action: 'share.download_url_issued', targetType: 'asset', targetId: asset.id, req, meta: { shareId: share.id } });
    return { url, fileName: asset.originalName, size: asset.size };
  }

  /**
   * Демо-ролик для главной страницы (ТЗ §5: «демо 4K-плеера»): публичная ссылка на видео,
   * назначенная администратором в настройке landing.demoShareToken. Открытие не считается в статистике ссылки.
   */
  async landingDemo() {
    const row = await this.prisma.setting.findUnique({ where: { key: 'landing.demoShareToken' } });
    const token = typeof row?.value === 'string' ? row.value : '';
    if (!token) return { demo: null };
    try {
      const share = await this.resolve(token);
      if (!share.assetId || share.passwordHash) return { demo: null };
      const asset = await this.assetInScope(share, share.assetId);
      if (asset.kind !== 'VIDEO' || !asset.derivatives.some((d) => d.kind === 'HLS')) return { demo: null };
      return { demo: { token, viewOnly: share.viewOnly, asset: await this.guestAsset(asset) } };
    } catch {
      return { demo: null };
    }
  }

  async report(token: string, dto: { reason: string; text?: string; assetId?: string }, req: Request) {
    const share = await this.prisma.shareLink.findUnique({ where: { token } });
    if (!share) throw new AppError(404, 'SHARE_NOT_FOUND', 'Ссылка не найдена');
    // Не больше 5 жалоб в час с одного адреса на одну ссылку
    const recent = await this.prisma.report.count({ where: { shareId: share.id, reporterIp: req.ip, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
    if (recent >= 5) throw new AppError(429, 'RATE_LIMITED', 'Жалоба уже отправлена');
    const r = await this.prisma.report.create({
      data: { shareId: share.id, assetId: dto.assetId ?? share.assetId, reason: dto.reason, text: (dto.text ?? '').slice(0, 2000), reporterIp: req.ip },
    });
    await this.audit.record({ action: 'report.created', targetType: 'share', targetId: share.id, req, meta: { reportId: r.id, reason: dto.reason } });
    return { ok: true };
  }
}
