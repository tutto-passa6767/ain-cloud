import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { UploadSession } from '@ain/db';
import { cfg } from '../config';
import { AccessService } from '../common/access.service';
import { AuditService } from '../common/audit.service';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { QueueService } from '../common/queue.service';
import { S3Service } from '../common/s3.service';
import { SettingsService } from '../common/settings.service';
import { AuthUser } from '../auth/auth.types';
import { cleanName } from '../drive/folders.service';
import { CompleteUploadDto, MatchFileDto, StartUploadDto } from './uploads.dto';

const MiB = 1024 * 1024;
const S3_MAX_PARTS = 10_000;
/** Если завершение «зависло» дольше этого времени (сбой процесса), его можно перехватить */
const COMPLETING_STALE_MS = 2 * 60_000;

const extensionOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
};

/**
 * Загрузка больших файлов (ТЗ §6). Файл идёт частями прямо в хранилище по подписанным ссылкам;
 * API управляет сессией, правами и квотой, но байты файла через себя не пропускает.
 */
@Injectable()
export class UploadsService {
  private readonly log = new Logger('Uploads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly access: AccessService,
    private readonly settings: SettingsService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
  ) {}

  present(s: UploadSession, extra: Record<string, unknown> = {}) {
    return {
      id: s.id,
      assetId: s.assetId,
      folderId: s.folderId,
      fileName: s.fileName,
      size: s.size,
      lastModified: s.lastModified,
      firstPartSha256: s.firstPartSha256,
      partSize: s.partSize,
      partsCount: s.partsCount,
      status: s.status,
      error: s.error,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
      completedAt: s.completedAt,
      ...extra,
    };
  }

  private async session(userId: string, id: string) {
    const s = await this.prisma.uploadSession.findFirst({ where: { id, userId } });
    if (!s) throw notFound('Сессия загрузки');
    return s;
  }

  private assertActive(s: UploadSession) {
    if (s.status !== 'ACTIVE') throw new AppError(409, 'UPLOAD_NOT_ACTIVE', 'Загрузка уже завершена или отменена', { status: s.status });
    if (s.expiresAt < new Date()) throw new AppError(410, 'UPLOAD_EXPIRED', 'Сессия загрузки истекла — начните заново');
  }

  private releaseReservation(userId: string, bytes: bigint) {
    return this.prisma.$executeRaw`
      UPDATE "User" SET "reservedBytes" = GREATEST("reservedBytes" - ${bytes}, 0) WHERE id = ${userId}::uuid`;
  }

  /**
   * Начало загрузки: проверка формата, размера, прав на папку и квоты.
   * Объём резервируется одним атомарным UPDATE — параллельные загрузки не обходят лимит (ТЗ §6.4, §16).
   */
  async start(user: AuthUser, dto: StartUploadDto, req: Request) {
    const fileName = cleanName(dto.fileName);
    const ext = extensionOf(fileName);
    const kind = ext ? await this.settings.kindForExtension(ext) : null;
    if (!kind) {
      throw new AppError(415, 'FORMAT_NOT_ALLOWED', 'Этот формат не поддерживается для хранения', { extension: ext });
    }
    const size = BigInt(dto.size);
    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { code: user.planCode } });
    if (size > plan.maxFileBytes) {
      throw new AppError(413, 'FILE_TOO_LARGE', 'Файл больше допустимого для тарифа', { maxFileBytes: plan.maxFileBytes });
    }
    const folderId = dto.folderId ?? null;
    if (folderId) await this.access.folder(user.id, folderId);

    let partSize = (await this.settings.get('upload.partSizeMb', cfg.upload.partSize / MiB)) * MiB;
    // S3 допускает не больше 10 000 частей — для очень больших файлов часть увеличивается
    const minPart = Math.ceil(Number(size) / S3_MAX_PARTS / MiB) * MiB;
    partSize = Math.max(partSize, minPart, 5 * MiB);
    const partsCount = Math.max(1, Math.ceil(Number(size) / partSize));

    const reserved = await this.prisma.$executeRaw`
      UPDATE "User" u SET "reservedBytes" = u."reservedBytes" + ${size}
      FROM "Plan" p
      WHERE u.id = ${user.id}::uuid AND p.code = u."planCode"
        AND u."usedBytes" + u."reservedBytes" + ${size} <= COALESCE(u."quotaOverride", p."quotaBytes")`;
    if (reserved === 0) {
      const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { plan: true } });
      throw new AppError(409, 'QUOTA_EXCEEDED', 'Недостаточно места в хранилище', {
        quotaBytes: u.quotaOverride ?? u.plan.quotaBytes,
        usedBytes: u.usedBytes,
        reservedBytes: u.reservedBytes,
        requestedBytes: size,
      });
    }

    // Технический ключ — случайный UUID; совпадение имён не перезаписывает чужой файл (ТЗ §6.4)
    const objectId = randomUUID();
    const objectKey = `o/${objectId.slice(0, 2)}/${objectId}`;
    let uploadId: string | undefined;
    try {
      uploadId = await this.s3.createMultipart(objectKey);
      const ttlDays = await this.settings.get('upload.sessionTtlDays', cfg.upload.sessionTtlDays);
      const session = await this.prisma.$transaction(async (tx) => {
        const asset = await tx.asset.create({
          data: {
            ownerId: user.id,
            uploadedById: user.id,
            folderId,
            name: fileName,
            originalName: fileName,
            extension: ext,
            kind,
            declaredMime: dto.mimeType?.slice(0, 200),
            size,
            objectKey,
            state: 'UPLOADING',
          },
        });
        return tx.uploadSession.create({
          data: {
            userId: user.id,
            assetId: asset.id,
            folderId,
            s3UploadId: uploadId!,
            objectKey,
            fileName,
            size,
            lastModified: BigInt(dto.lastModified),
            firstPartSha256: dto.firstPartSha256,
            partSize,
            partsCount,
            reservedBytes: size,
            expiresAt: new Date(Date.now() + ttlDays * 86400_000),
          },
        });
      });
      await this.audit.record({
        action: 'upload.started',
        actorId: user.id,
        targetType: 'asset',
        targetId: session.assetId,
        req,
        meta: { size: dto.size, kind, ext },
      });
      return { session: this.present(session), parallelParts: await this.settings.get('upload.parallelParts', cfg.upload.parallelParts) };
    } catch (e) {
      await this.releaseReservation(user.id, size);
      if (uploadId) await this.s3.abortMultipart(objectKey, uploadId).catch(() => undefined);
      throw e;
    }
  }

  /** Подписанные ссылки на отправку частей (живут SIGNED_URL_TTL_SEC) */
  async signParts(userId: string, id: string, partNumbers: number[]) {
    const s = await this.session(userId, id);
    this.assertActive(s);
    const urls: Record<number, string> = {};
    for (const n of new Set(partNumbers)) {
      if (n < 1 || n > s.partsCount) throw new AppError(400, 'BAD_PART_NUMBER', 'Неверный номер части', { partNumber: n });
      urls[n] = await this.s3.presignUploadPart(s.objectKey, s.s3UploadId, n, cfg.signedUrlTtlSec);
    }
    return { urls, expiresInSec: cfg.signedUrlTtlSec };
  }

  /** Состояние сессии; принятые части сверяются с хранилищем, а не берутся со слов клиента (ТЗ §6.3) */
  async status(userId: string, id: string) {
    const s = await this.session(userId, id);
    let parts: { partNumber: number; size: number; etag: string }[] = [];
    if (s.status === 'ACTIVE' || s.status === 'COMPLETING') {
      try {
        parts = (await this.s3.listParts(s.objectKey, s.s3UploadId)).map((p) => ({
          partNumber: p.PartNumber!,
          size: Number(p.Size ?? 0),
          etag: p.ETag!,
        }));
      } catch (e: any) {
        if (e?.name !== 'NoSuchUpload') throw e;
      }
    }
    const uploadedBytes = parts.reduce((acc, p) => acc + p.size, 0);
    return { session: this.present(s, { parts, uploadedBytes }) };
  }

  /** Сверка заново выбранного файла с сессией: имя, размер, дата изменения, хеш первой части */
  async match(userId: string, id: string, dto: MatchFileDto) {
    const s = await this.session(userId, id);
    this.assertActive(s);
    const mismatched: string[] = [];
    if (cleanName(dto.fileName) !== s.fileName) mismatched.push('fileName');
    if (BigInt(dto.size) !== s.size) mismatched.push('size');
    if (BigInt(dto.lastModified) !== s.lastModified) mismatched.push('lastModified');
    if (dto.firstPartSha256 !== s.firstPartSha256) mismatched.push('firstPartSha256');
    if (mismatched.length) {
      throw new AppError(409, 'FILE_MISMATCH', 'Выбран другой файл — он не совпадает с прерванной загрузкой', { mismatched });
    }
    return this.status(userId, id);
  }

  /**
   * Завершение загрузки. Идемпотентно: повторный запрос возвращает тот же результат и не создаёт дубликат.
   * Части и итоговый размер сверяются с хранилищем.
   */
  async complete(user: AuthUser, id: string, dto: CompleteUploadDto, req: Request) {
    let s = await this.session(user.id, id);
    if (s.status === 'COMPLETED') return { assetId: s.assetId, status: s.status };
    if (s.status !== 'ACTIVE' && s.status !== 'COMPLETING') {
      throw new AppError(409, 'UPLOAD_NOT_ACTIVE', 'Загрузка уже отменена', { status: s.status });
    }

    // Захватываем завершение, чтобы два одновременных запроса не завершили сессию дважды
    const claimed = await this.prisma.uploadSession.updateMany({
      where: {
        id,
        OR: [{ status: 'ACTIVE' }, { status: 'COMPLETING', updatedAt: { lt: new Date(Date.now() - COMPLETING_STALE_MS) } }],
      },
      data: { status: 'COMPLETING' },
    });
    if (claimed.count === 0) {
      s = await this.session(user.id, id);
      if (s.status === 'COMPLETED') return { assetId: s.assetId, status: s.status };
      throw new AppError(409, 'UPLOAD_COMPLETING', 'Загрузка уже завершается — повторите запрос через несколько секунд');
    }

    const backToActive = () => this.prisma.uploadSession.update({ where: { id }, data: { status: 'ACTIVE' } });

    try {
      let alreadyAssembled = false;
      let parts: { PartNumber: number; ETag: string; Size: number }[] = [];
      try {
        parts = (await this.s3.listParts(s.objectKey, s.s3UploadId)).map((p) => ({
          PartNumber: p.PartNumber!,
          ETag: p.ETag!,
          Size: Number(p.Size ?? 0),
        }));
      } catch (e: any) {
        // Сборка могла пройти в прошлой попытке, а ответ потеряться
        if (e?.name !== 'NoSuchUpload') throw e;
        alreadyAssembled = true;
      }

      if (!alreadyAssembled) {
        const missing: number[] = [];
        const lastSize = Number(s.size) - s.partSize * (s.partsCount - 1);
        for (let n = 1; n <= s.partsCount; n++) {
          const p = parts.find((x) => x.PartNumber === n);
          const expected = n === s.partsCount ? lastSize : s.partSize;
          if (!p || p.Size !== expected) missing.push(n);
        }
        if (missing.length) {
          await backToActive();
          throw new AppError(409, 'PARTS_MISSING', 'Не все части файла получены хранилищем', { missing: missing.slice(0, 100), missingCount: missing.length });
        }
        await this.s3.completeMultipart(
          s.objectKey,
          s.s3UploadId,
          parts.filter((p) => p.PartNumber <= s.partsCount).map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
        );
      }

      const head = await this.s3.headOriginal(s.objectKey);
      if (!head || BigInt(head.size) !== s.size) {
        // Итоговый размер не совпал — такой оригинал не принимаем
        await this.s3.deleteObject(this.s3.originals, s.objectKey).catch(() => undefined);
        await this.prisma.$transaction([
          this.prisma.uploadSession.update({ where: { id }, data: { status: 'FAILED', error: 'SIZE_MISMATCH' } }),
          this.prisma.asset.update({ where: { id: s.assetId }, data: { deletedAt: new Date() } }),
        ]);
        await this.releaseReservation(user.id, s.reservedBytes);
        throw new AppError(422, 'SIZE_MISMATCH', 'Размер полученного файла не совпадает с исходным', { expected: s.size, actual: head?.size ?? null });
      }

      await this.prisma.$transaction([
        this.prisma.uploadSession.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date(), error: null } }),
        this.prisma.asset.update({
          where: { id: s.assetId },
          data: { state: 'RECEIVED', stateChangedAt: new Date(), sha256Client: dto.sha256 },
        }),
        this.prisma.$executeRaw`
          UPDATE "User" SET "reservedBytes" = GREATEST("reservedBytes" - ${s.reservedBytes}, 0),
                            "usedBytes" = "usedBytes" + ${s.size}
          WHERE id = ${user.id}::uuid`,
      ]);
    } catch (e) {
      const current = await this.prisma.uploadSession.findUnique({ where: { id } });
      if (current?.status === 'COMPLETING') await backToActive().catch(() => undefined);
      throw e;
    }

    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { code: user.planCode } });
    await this.queue.enqueueVerify(s.assetId, plan.queuePriority);
    await this.audit.record({
      action: 'upload.completed',
      actorId: user.id,
      targetType: 'asset',
      targetId: s.assetId,
      req,
      meta: { size: Number(s.size), parts: s.partsCount },
    });
    return { assetId: s.assetId, status: 'COMPLETED' as const };
  }

  /** Отмена: части удаляются из хранилища, резерв квоты снимается */
  async abort(userId: string, id: string, req: Request) {
    const s = await this.session(userId, id);
    if (s.status === 'ABORTED' || s.status === 'EXPIRED') return { ok: true };
    if (s.status === 'COMPLETED') throw new AppError(409, 'UPLOAD_COMPLETED', 'Загрузка уже завершена — удалите файл из медиатеки');
    const claimed = await this.prisma.uploadSession.updateMany({
      where: { id, status: { in: ['ACTIVE', 'FAILED'] } },
      data: { status: 'ABORTED' },
    });
    if (!claimed.count) throw new AppError(409, 'UPLOAD_COMPLETING', 'Загрузка завершается — отменить её уже нельзя');
    await this.s3.abortMultipart(s.objectKey, s.s3UploadId);
    if (s.status === 'ACTIVE') await this.releaseReservation(userId, s.reservedBytes);
    await this.prisma.asset.update({ where: { id: s.assetId }, data: { deletedAt: new Date() } });
    await this.audit.record({ action: 'upload.aborted', actorId: userId, targetType: 'asset', targetId: s.assetId, req });
    return { ok: true };
  }

  /** Активные, завершённые и ошибочные загрузки для страницы «Загрузки» (ТЗ §5) */
  async list(userId: string) {
    const [active, recent] = await Promise.all([
      this.prisma.uploadSession.findMany({
        where: { userId, status: { in: ['ACTIVE', 'COMPLETING'] }, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.uploadSession.findMany({
        where: { userId, status: { in: ['COMPLETED', 'ABORTED', 'EXPIRED', 'FAILED'] } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: { asset: { select: { id: true, state: true, processing: true, processingProgress: true, deletedAt: true, name: true } } },
      }),
    ]);
    return {
      active: active.map((s) => this.present(s)),
      recent: recent.map((s) => this.present(s, { asset: s.asset })),
    };
  }
}
