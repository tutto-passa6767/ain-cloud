import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../auth/auth.types';
import { SharesService } from './shares.service';

class CreateShareDto {
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(100)
  password?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxDownloads?: number;

  @IsOptional()
  @IsBoolean()
  viewOnly?: boolean;
}

class ListSharesQuery {
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;
}

class UnlockDto {
  @IsString()
  @MaxLength(100)
  password: string;
}

class ReportDto {
  @IsIn(['illegal', 'copyright', 'malware', 'abuse', 'other'])
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;
}

@ApiTags('shares')
@Controller('shares')
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateShareDto, @Req() req: Request) {
    return this.shares.create(u.id, dto, req);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: ListSharesQuery) {
    return this.shares.list(u.id, q);
  }

  @Delete(':id')
  revoke(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.shares.revoke(u.id, id, req);
  }
}

/** Данные для публичной главной страницы */
@ApiTags('public')
@Public()
@Controller('public')
export class PublicLandingController {
  constructor(private readonly shares: SharesService) {}

  @Get('landing')
  landing() {
    return this.shares.landingDemo();
  }
}

/** Доступ гостя по публичной ссылке /s/:token (ТЗ §4.2 «Гость», §9) */
@ApiTags('public')
@Public()
@Controller('public/s/:token')
export class PublicShareController {
  constructor(private readonly shares: SharesService) {}

  @Get()
  meta(@Param('token') token: string, @Req() req: Request) {
    return this.shares.meta(token, req);
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('unlock')
  unlock(@Param('token') token: string, @Body() dto: UnlockDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.shares.unlock(token, dto.password, req, res);
  }

  @Get('content')
  content(@Param('token') token: string, @Query('folderId') folderId: string | undefined, @Req() req: Request) {
    if (folderId !== undefined && !/^[0-9a-f-]{36}$/.test(folderId)) folderId = undefined;
    return this.shares.content(token, folderId, req);
  }

  @Get('assets/:assetId')
  asset(@Param('token') token: string, @Param('assetId', ParseUUIDPipe) assetId: string, @Req() req: Request) {
    return this.shares.asset(token, assetId, req);
  }

  @Get('assets/:assetId/hls/:file')
  @Header('Content-Type', 'application/vnd.apple.mpegurl')
  @Header('Cache-Control', 'private, no-store')
  hls(@Param('token') token: string, @Param('assetId', ParseUUIDPipe) assetId: string, @Param('file') file: string, @Req() req: Request) {
    return file === 'master.m3u8' ? this.shares.master(token, assetId, req) : this.shares.variant(token, assetId, file, req);
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('assets/:assetId/download')
  download(@Param('token') token: string, @Param('assetId', ParseUUIDPipe) assetId: string, @Req() req: Request) {
    return this.shares.download(token, assetId, req);
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('report')
  report(@Param('token') token: string, @Body() dto: ReportDto, @Req() req: Request) {
    return this.shares.report(token, dto, req);
  }
}
