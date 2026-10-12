import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { PlanCode, Prisma, ReportStatus, UserRole } from '@ain/db';
import { AuditService } from '../common/audit.service';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { QueueService } from '../common/queue.service';
import { S3Service } from '../common/s3.service';
import { SettingsService } from '../common/settings.service';
import { AuthUser } from '../auth/auth.types';

const day = 86400_000;

/** Настройки, которые администратор меняет без разработчиков (ТЗ §15) */
const SETTING_RULES: Record<string, (v: unknown) => boolean> = {
  'formats.allowed': (v) =>
    !!v && typeof v === 'object' && Object.values(v as Record<string, unknown>).every((l) => Array.isArray(l) && l.every((x) => typeof x === 'string' && /^[a-z0-9]{1,10}$/.test(x))),
  'upload.partSizeMb': (v) => Number.isInteger(v) && (v as number) >= 5 && (v as number) <= 512,
  'upload.parallelParts': (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 8,
  'upload.sessionTtlDays': (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 30,
  'trash.retentionDays': (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 365,
  'processing.maxAttempts': (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 10,
  /** Публичная ссылка на ролик для демо 4K-плеера на главной; пустая строка — демо скрыто */
  'landing.demoShareToken': (v) => typeof v === 'string' && (v === '' || /^[A-Za-z0-9_-]{16,64}$/.test(v)),
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly s3: S3Service,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  // ---------- дашборд ----------

  async dashboard() {
    const now = Date.now();
    const since14 = new Date(now - 14 * day);
    const [users, newToday, dau, mau, storage, regs, added, failed, restricted, blocked, openReports, loginFailed, unlockFailed, verifyCounts, processCounts, workers] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { createdAt: { gt: new Date(now - day) } } }),
        this.prisma.session.findMany({ where: { lastSeenAt: { gt: new Date(now - day) } }, distinct: ['userId'], select: { userId: true } }),
        this.prisma.session.findMany({ where: { lastSeenAt: { gt: new Date(now - 30 * day) } }, distinct: ['userId'], select: { userId: true } }),
        this.prisma.user.aggregate({ _sum: { usedBytes: true, reservedBytes: true } }),
        this.prisma.$queryRaw<{ d: Date; n: bigint }[]>`
          SELECT date_trunc('day', "createdAt") d, count(*) n FROM "User" WHERE "createdAt" > ${since14} GROUP BY 1 ORDER BY 1`,
        this.prisma.$queryRaw<{ d: Date; bytes: bigint | null; n: bigint }[]>`
          SELECT date_trunc('day', "createdAt") d, sum(size) bytes, count(*) n FROM "Asset"
          WHERE "createdAt" > ${since14} AND state <> 'UPLOADING' GROUP BY 1 ORDER BY 1`,
        this.prisma.asset.count({ where: { processing: 'FAILED', deletedAt: null } }),
        this.prisma.asset.count({ where: { state: 'RESTRICTED', deletedAt: null } }),
        this.prisma.asset.count({ where: { state: 'BLOCKED', deletedAt: null } }),
        this.prisma.report.count({ where: { status: 'OPEN' } }),
        this.prisma.auditEvent.count({ where: { action: { in: ['auth.login_failed', 'auth.mfa_failed'] }, at: { gt: new Date(now - day) } } }),
        this.prisma.auditEvent.count({ where: { action: 'share.unlock_failed', at: { gt: new Date(now - day) } } }),
        this.queue.verify.getJobCounts('waiting', 'active', 'delayed', 'failed', 'prioritized'),
        this.queue.process.getJobCounts('waiting', 'active', 'delayed', 'failed', 'prioritized'),
        this.queue.process.getWorkers().then((w) => w.length).catch(() => 0),
      ]);
    return {
      users: { total: users, newToday, dau: dau.length, mau: mau.length },
      storage: { usedBytes: storage._sum.usedBytes ?? 0n, reservedBytes: storage._sum.reservedBytes ?? 0n },
      registrations: regs.map((r) => ({ day: r.d, count: Number(r.n) })),
      uploads: added.map((r) => ({ day: r.d, bytes: Number(r.bytes ?? 0), count: Number(r.n) })),
      processing: { failed, verifyQueue: verifyCounts, processQueue: processCounts, workers },
      security: { restricted, blocked, openReports, loginFailed24h: loginFailed, shareUnlockFailed24h: unlockFailed },
      // Платёжная система ещё не подключена — выручка не выдумывается (ТЗ §5: цифры только из реальных данных)
      revenue: null,
    };
  }

  // ---------- пользователи ----------

  async users(q: string | undefined, page: number) {
    const where: Prisma.UserWhereInput = q
      ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * 50,
        take: 50,
        select: {
          id: true, email: true, name: true, role: true, planCode: true, usedBytes: true, reservedBytes: true, quotaOverride: true,
          emailVerifiedAt: true, totpEnabledAt: true, blockedAt: true, blockedReason: true, createdAt: true,
          plan: { select: { quotaBytes: true } },
          _count: { select: { assets: true } },
        },
      }),
    ]);
    return {
      total,
      items: rows.map(({ plan, _count, ...u }) => ({ ...u, quotaBytes: u.quotaOverride ?? plan.quotaBytes, assets: _count.assets, twoFactor: !!u.totpEnabledAt })),
    };
  }

  async updateUser(actor: AuthUser, id: string, dto: { planCode?: PlanCode; quotaOverrideGb?: number | null; blocked?: boolean; blockedReason?: string; role?: UserRole }, req: Request) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('Пользователь');
    if (id === actor.id && (dto.blocked || dto.role)) throw new AppError(400, 'SELF_CHANGE', 'Нельзя заблокировать себя или сменить свою роль');
    const adminOnly = dto.planCode !== undefined || dto.quotaOverrideGb !== undefined || dto.role !== undefined;
    if (adminOnly && actor.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Только администратор меняет тариф, квоту и роль');
    const data: Prisma.UserUpdateInput = {};
    if (dto.planCode) data.plan = { connect: { code: dto.planCode } };
    if (dto.quotaOverrideGb !== undefined) data.quotaOverride = dto.quotaOverrideGb === null ? null : BigInt(Math.round(dto.quotaOverrideGb * 1024 ** 3));
    if (dto.role) data.role = dto.role;
    if (dto.blocked !== undefined) {
      data.blockedAt = dto.blocked ? new Date() : null;
      data.blockedReason = dto.blocked ? (dto.blockedReason ?? '').slice(0, 500) : null;
    }
    await this.prisma.user.update({ where: { id }, data });
    // Заблокированный пользователь сразу теряет активные сессии
    if (dto.blocked) await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.record({ action: 'admin.user_updated', actorId: actor.id, targetType: 'user', targetId: id, req, meta: { ...dto } });
    return { ok: true };
  }

  async resetTwoFactor(actor: AuthUser, id: string, req: Request) {
    await this.prisma.user.update({ where: { id }, data: { totpSecret: null, totpEnabledAt: null } });
    await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.record({ action: 'admin.2fa_reset', actorId: actor.id, targetType: 'user', targetId: id, req });
    return { ok: true };
  }

  // ---------- жалобы и модерация ----------

  async reports(status: ReportStatus) {
    const rows = await this.prisma.report.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        asset: { select: { id: true, name: true, kind: true, size: true, state: true, owner: { select: { email: true } } } },
        share: { select: { id: true, token: true, blockedAt: true, revokedAt: true } },
      },
    });
    return { items: rows };
  }

  /**
   * Просмотр содержимого по жалобе — единственный путь сотрудника к пользовательским файлам.
   * Каждое обращение пишется в журнал (ТЗ §4.2, §10.2).
   */
  async reportPreview(actor: AuthUser, reportId: string, req: Request) {
    const r = await this.prisma.report.findUnique({ where: { id: reportId }, include: { asset: { include: { derivatives: true } } } });
    if (!r?.asset) throw notFound('Жалоба');
    const d = r.asset.derivatives.find((x) => x.kind === 'PREVIEW') ?? r.asset.derivatives.find((x) => x.kind === 'THUMB_LG');
    await this.audit.record({ action: 'staff.content_access', actorId: actor.id, targetType: 'asset', targetId: r.asset.id, req, meta: { reportId, basis: 'report' } });
    return { url: d ? await this.s3.presignGet(this.s3.derived, d.objectKey, { ttlSec: 300 }) : null, name: r.asset.name, kind: r.asset.kind };
  }

  async resolveReport(actor: AuthUser, id: string, dto: { action: 'block_asset' | 'block_share' | 'reject'; reason: string }, req: Request) {
    const r = await this.prisma.report.findUnique({ where: { id } });
    if (!r) throw notFound('Жалоба');
    const reason = dto.reason.slice(0, 500);
    if (dto.action === 'block_asset' && r.assetId) {
      await this.prisma.asset.update({ where: { id: r.assetId }, data: { state: 'BLOCKED', stateReason: `MODERATION: ${reason}`, stateChangedAt: new Date() } });
      // Ссылки на заблокированный файл тоже закрываются
      await this.prisma.shareLink.updateMany({ where: { assetId: r.assetId, blockedAt: null }, data: { blockedAt: new Date(), blockedReason: reason } });
    }
    if (dto.action === 'block_share' && r.shareId) {
      await this.prisma.shareLink.update({ where: { id: r.shareId }, data: { blockedAt: new Date(), blockedReason: reason } });
    }
    await this.prisma.report.update({
      where: { id },
      data: { status: dto.action === 'reject' ? 'REJECTED' : 'RESOLVED', resolvedById: actor.id, resolution: `${dto.action}: ${reason}`, resolvedAt: new Date() },
    });
    await this.audit.record({ action: `moderation.${dto.action}`, actorId: actor.id, targetType: 'report', targetId: id, req, meta: { assetId: r.assetId, shareId: r.shareId, reason } });
    return { ok: true };
  }

  // ---------- файлы: обработка и ограничения ----------

  async assets(filter: 'restricted' | 'blocked' | 'failed') {
    const where: Prisma.AssetWhereInput =
      filter === 'failed' ? { processing: 'FAILED' } : filter === 'blocked' ? { state: 'BLOCKED' } : { state: 'RESTRICTED' };
    const rows = await this.prisma.asset.findMany({
      where: { ...where, deletedAt: null },
      orderBy: { stateChangedAt: 'desc' },
      take: 200,
      select: {
        id: true, name: true, kind: true, size: true, state: true, stateReason: true, processing: true, processingError: true,
        processingAttempts: true, createdAt: true, stateChangedAt: true, owner: { select: { email: true, plan: { select: { queuePriority: true } } } },
      },
    });
    return { items: rows };
  }

  async assetAction(actor: AuthUser, id: string, action: 'rescan' | 'reprocess' | 'block' | 'unblock', reason: string | undefined, req: Request) {
    const a = await this.prisma.asset.findUnique({ where: { id }, include: { owner: { include: { plan: true } } } });
    if (!a) throw notFound('Файл');
    const moderation = action === 'block' || action === 'unblock';
    if (moderation && !['ADMIN', 'MODERATOR'].includes(actor.role)) throw new AppError(403, 'FORBIDDEN', 'Недостаточно прав');
    if (!moderation && !['ADMIN', 'SUPPORT'].includes(actor.role)) throw new AppError(403, 'FORBIDDEN', 'Недостаточно прав');
    switch (action) {
      case 'rescan':
        await this.prisma.asset.update({ where: { id }, data: { state: 'RECEIVED', stateReason: null, stateChangedAt: new Date() } });
        await this.queue.enqueueRescan(id, a.owner.plan.queuePriority);
        break;
      case 'reprocess':
        // Перезапуск обработки: оригинал не трогается, производные версии пересоздаются (ТЗ §7.4)
        if (a.state !== 'VERIFIED' && a.state !== 'RESTRICTED') throw new AppError(409, 'NOT_VERIFIED', 'Файл не проверен');
        await this.prisma.asset.update({ where: { id }, data: { processing: 'PENDING', processingProgress: 0, processingError: null, processingAttempts: 0 } });
        await this.queue.enqueueProcess(id, a.owner.plan.queuePriority);
        break;
      case 'block':
        await this.prisma.asset.update({ where: { id }, data: { state: 'BLOCKED', stateReason: `MODERATION: ${(reason ?? '').slice(0, 500)}`, stateChangedAt: new Date() } });
        await this.prisma.shareLink.updateMany({ where: { assetId: id, blockedAt: null }, data: { blockedAt: new Date(), blockedReason: reason ?? null } });
        break;
      case 'unblock':
        // Снятие блокировки отправляет файл на повторную проверку, а не сразу в «Проверен»
        await this.prisma.asset.update({ where: { id }, data: { state: 'RECEIVED', stateReason: null, stateChangedAt: new Date() } });
        await this.queue.enqueueRescan(id, a.owner.plan.queuePriority);
        break;
    }
    await this.audit.record({ action: `admin.asset_${action}`, actorId: actor.id, targetType: 'asset', targetId: id, req, meta: { reason } });
    return { ok: true };
  }

  // ---------- журнал ----------

  private auditWhere(f: { action?: string; actor?: string; target?: string; from?: Date; to?: Date }): Prisma.AuditEventWhereInput {
    return {
      action: f.action ? { startsWith: f.action } : undefined,
      actorId: f.actor && /^[0-9a-f-]{36}$/.test(f.actor) ? f.actor : undefined,
      targetId: f.target || undefined,
      at: f.from || f.to ? { gte: f.from, lte: f.to } : undefined,
    };
  }

  async auditLog(f: { action?: string; actor?: string; target?: string; from?: Date; to?: Date; before?: string }) {
    const rows = await this.prisma.auditEvent.findMany({
      where: { ...this.auditWhere(f), ...(f.before ? { id: { lt: BigInt(f.before) } } : {}) },
      orderBy: { id: 'desc' },
      take: 100,
    });
    const actors = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])] } }, select: { id: true, email: true } });
    const emails = new Map(actors.map((a) => [a.id, a.email]));
    return {
      items: rows.map((r) => ({ ...r, id: r.id.toString(), actorEmail: r.actorId ? emails.get(r.actorId) ?? null : null })),
      next: rows.length === 100 ? rows[rows.length - 1].id.toString() : null,
    };
  }

  /** Выгрузка журнала в CSV для проверок (ТЗ §15) */
  async auditCsv(f: { action?: string; actor?: string; target?: string; from?: Date; to?: Date }, actor: AuthUser, req: Request) {
    const rows = await this.prisma.auditEvent.findMany({ where: this.auditWhere(f), orderBy: { id: 'desc' }, take: 50_000 });
    await this.audit.record({ action: 'admin.audit_export', actorId: actor.id, req, meta: { rows: rows.length } });
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['id', 'at', 'action', 'actorId', 'targetType', 'targetId', 'ip', 'meta'];
    return [head.join(','), ...rows.map((r) => [r.id, r.at.toISOString(), r.action, r.actorId, r.targetType, r.targetId, r.ip, r.meta].map(esc).join(','))].join('\n');
  }

  // ---------- настройки ----------

  async getSettings() {
    const rows = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
    return { items: rows.filter((r) => r.key in SETTING_RULES) };
  }

  async setSetting(actor: AuthUser, key: string, value: unknown, req: Request) {
    const rule = SETTING_RULES[key];
    if (!rule) throw notFound('Настройка');
    if (!rule(value)) throw new AppError(400, 'INVALID_SETTING', 'Недопустимое значение настройки', { key });
    const prev = await this.prisma.setting.findUnique({ where: { key } });
    await this.prisma.setting.upsert({ where: { key }, update: { value: value as Prisma.InputJsonValue }, create: { key, value: value as Prisma.InputJsonValue } });
    this.settings.invalidate();
    await this.audit.record({ action: 'admin.setting_changed', actorId: actor.id, targetType: 'setting', targetId: key, req, meta: { from: prev?.value ?? null, to: value as object } });
    return { ok: true };
  }
}
