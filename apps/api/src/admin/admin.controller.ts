import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.types';
import { AdminService } from './admin.service';

class UpdateUserDto {
  @IsOptional()
  @IsIn(['FREE', 'PRO', 'PRO_MAX', 'BUSINESS'])
  planCode?: 'FREE' | 'PRO' | 'PRO_MAX' | 'BUSINESS';

  /** Индивидуальная квота в ГБ; null — по тарифу */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  quotaOverrideGb?: number | null;

  @IsOptional()
  @IsBoolean()
  blocked?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  blockedReason?: string;

  @IsOptional()
  @IsIn(['USER', 'MODERATOR', 'SUPPORT', 'ACCOUNTANT', 'ADMIN'])
  role?: 'USER' | 'MODERATOR' | 'SUPPORT' | 'ACCOUNTANT' | 'ADMIN';
}

class ResolveReportDto {
  @IsIn(['block_asset', 'block_share', 'reject'])
  action: 'block_asset' | 'block_share' | 'reject';

  @IsString()
  @MaxLength(500)
  reason: string;
}

class AssetActionDto {
  @IsIn(['rescan', 'reprocess', 'block', 'unblock'])
  action: 'rescan' | 'reprocess' | 'block' | 'unblock';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class AuditQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsString()
  actor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  target?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsString()
  before?: string;
}

/** Админ-панель (ТЗ §15). Доступ — только сотрудникам с включённой 2FA. */
@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Roles('ADMIN', 'MODERATOR', 'SUPPORT', 'ACCOUNTANT')
  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Roles('ADMIN', 'SUPPORT')
  @Get('users')
  users(@Query('q') q?: string, @Query('page') page?: string) {
    return this.admin.users(q?.slice(0, 100), Math.max(0, Number(page) || 0));
  }

  @Roles('ADMIN', 'SUPPORT')
  @Patch('users/:id')
  updateUser(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @Req() req: Request) {
    return this.admin.updateUser(u, id, dto, req);
  }

  @Roles('ADMIN', 'SUPPORT')
  @HttpCode(200)
  @Post('users/:id/reset-2fa')
  reset2fa(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.admin.resetTwoFactor(u, id, req);
  }

  @Roles('ADMIN', 'MODERATOR')
  @Get('reports')
  reports(@Query('status') status = 'OPEN') {
    return this.admin.reports((['OPEN', 'RESOLVED', 'REJECTED'].includes(status) ? status : 'OPEN') as 'OPEN');
  }

  @Roles('ADMIN', 'MODERATOR')
  @Get('reports/:id/preview')
  reportPreview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.admin.reportPreview(u, id, req);
  }

  @Roles('ADMIN', 'MODERATOR')
  @HttpCode(200)
  @Post('reports/:id/resolve')
  resolve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveReportDto, @Req() req: Request) {
    return this.admin.resolveReport(u, id, dto, req);
  }

  @Roles('ADMIN', 'MODERATOR', 'SUPPORT')
  @Get('assets')
  assets(@Query('filter') filter = 'restricted') {
    return this.admin.assets((['restricted', 'blocked', 'failed'].includes(filter) ? filter : 'restricted') as 'restricted');
  }

  @Roles('ADMIN', 'MODERATOR', 'SUPPORT')
  @HttpCode(200)
  @Post('assets/:id/action')
  assetAction(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssetActionDto, @Req() req: Request) {
    return this.admin.assetAction(u, id, dto.action, dto.reason, req);
  }

  @Roles('ADMIN')
  @Get('audit')
  audit(@Query() q: AuditQuery) {
    return this.admin.auditLog(q);
  }

  @Roles('ADMIN')
  @Get('audit.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="ain-audit.csv"')
  auditCsv(@CurrentUser() u: AuthUser, @Query() q: AuditQuery, @Req() req: Request) {
    return this.admin.auditCsv(q, u, req);
  }

  @Roles('ADMIN')
  @Get('settings')
  settings() {
    return this.admin.getSettings();
  }

  @Roles('ADMIN')
  @Put('settings/:key')
  setSetting(@CurrentUser() u: AuthUser, @Param('key') key: string, @Body() body: { value: unknown }, @Req() req: Request) {
    return this.admin.setSetting(u, key, body?.value, req);
  }
}
