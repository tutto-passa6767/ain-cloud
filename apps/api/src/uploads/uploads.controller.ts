import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthUser, CurrentUser } from '../auth/auth.types';
import { CompleteUploadDto, MatchFileDto, SignPartsDto, StartUploadDto } from './uploads.dto';
import { UploadsService } from './uploads.service';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.uploads.list(u.id);
  }

  @Post()
  start(@CurrentUser() u: AuthUser, @Body() dto: StartUploadDto, @Req() req: Request) {
    return this.uploads.start(u, dto, req);
  }

  @Get(':id')
  status(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.uploads.status(u.id, id);
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post(':id/parts')
  sign(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SignPartsDto) {
    return this.uploads.signParts(u.id, id, dto.partNumbers);
  }

  @HttpCode(200)
  @Post(':id/match')
  match(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MatchFileDto) {
    return this.uploads.match(u.id, id, dto);
  }

  @HttpCode(200)
  @Post(':id/complete')
  complete(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteUploadDto, @Req() req: Request) {
    return this.uploads.complete(u, id, dto, req);
  }

  @Delete(':id')
  abort(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.uploads.abort(u.id, id, req);
  }
}
