import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { cfg } from '../config';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { AllowUnverified, AuthedRequest, AuthUser, CurrentUser, Public } from '../auth/auth.types';
import { USER_SELECT } from '../auth/session.service';

class UpdateMeDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsIn(['ru', 'kk', 'en'])
  locale?: string;

  @IsOptional()
  @IsIn(['DARK', 'LIGHT'])
  theme?: 'DARK' | 'LIGHT';

  /** Барыс на сайте: включён, свёрнут в кнопку или выключен (ТЗ §13.4) — хранится в аккаунте */
  @IsOptional()
  @IsIn(['ON', 'COLLAPSED', 'OFF'])
  mascotMode?: 'ON' | 'COLLAPSED' | 'OFF';

  /** Пользователь прошёл онбординг */
  @IsOptional()
  @IsBoolean()
  onboarded?: boolean;
}

@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Профиль, тариф, занятое место и параметры загрузки. Без входа возвращает user: null. */
  @Public()
  @Get()
  async me(@Req() req: AuthedRequest) {
    if (!req.user) return { user: null };
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: req.user.id },
      select: { ...USER_SELECT, usedBytes: true, reservedBytes: true, quotaOverride: true, plan: true },
    });
    const { plan, usedBytes, reservedBytes, quotaOverride, ...user } = u;
    const [files, folders, processing] = await Promise.all([
      this.prisma.asset.count({ where: { ownerId: u.id, deletedAt: null, state: { not: 'UPLOADING' } } }),
      this.prisma.folder.count({ where: { ownerId: u.id, deletedAt: null } }),
      this.prisma.asset.count({ where: { ownerId: u.id, deletedAt: null, processing: { in: ['PENDING', 'RUNNING'] } } }),
    ]);
    return {
      user,
      plan: {
        code: plan.code,
        name: plan.name,
        quotaBytes: plan.quotaBytes,
        maxFileBytes: plan.maxFileBytes,
        maxVideoHeight: plan.maxVideoHeight,
        features: plan.features,
      },
      usage: { usedBytes, reservedBytes, quotaBytes: quotaOverride ?? plan.quotaBytes },
      stats: { files, folders, processing },
      upload: {
        partSize: await this.settings.get('upload.partSizeMb', cfg.upload.partSize / 1048576) * 1048576,
        parallelParts: await this.settings.get('upload.parallelParts', cfg.upload.parallelParts),
      },
      formats: await this.settings.allowedFormats(),
    };
  }

  @AllowUnverified()
  @Patch()
  async update(@CurrentUser() me: AuthUser, @Body() dto: UpdateMeDto, @Req() req: AuthedRequest) {
    const user = await this.prisma.user.update({
      where: { id: me.id },
      data: {
        name: dto.name,
        locale: dto.locale,
        theme: dto.theme,
        mascotMode: dto.mascotMode,
        onboardedAt: dto.onboarded === undefined ? undefined : dto.onboarded ? new Date() : null,
      },
      select: USER_SELECT,
    });
    if (dto.mascotMode) {
      await this.audit.record({ action: 'settings.mascot', actorId: me.id, req, meta: { mode: dto.mascotMode } });
    }
    return { user };
  }
}
