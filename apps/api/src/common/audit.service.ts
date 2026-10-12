import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from './prisma.service';

export interface AuditInput {
  action: string;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  req?: Request;
}

/**
 * Журнал действий (ТЗ §10.3). Пользователи журнал не редактируют — API для изменения записей нет.
 * Выдача ссылки на скачивание пишется как `download.url_issued`, а не как завершённое скачивание.
 */
@Injectable()
export class AuditService {
  private readonly log = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          action: input.action,
          actorId: input.actorId ?? null,
          targetType: input.targetType,
          targetId: input.targetId,
          meta: (input.meta ?? undefined) as any,
          ip: input.req?.ip,
          userAgent: input.req?.headers['user-agent']?.slice(0, 400),
        },
      });
    } catch (e) {
      // Ошибка журнала не должна ломать действие пользователя, но должна быть видна в логах
      this.log.error(`Не удалось записать событие ${input.action}: ${(e as Error).message}`);
    }
  }
}
