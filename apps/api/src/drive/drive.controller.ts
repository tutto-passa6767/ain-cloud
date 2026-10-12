import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser } from '../auth/auth.types';
import {
  BulkDto,
  CreateFolderDto,
  DownloadDto,
  EnsurePathDto,
  ListQuery,
  SearchQuery,
  TrashItemsDto,
  UpdateAssetDto,
  UpdateFolderDto,
} from './drive.dto';
import { DriveService } from './drive.service';
import { FoldersService } from './folders.service';
import { MediaService } from './media.service';
import { SearchService } from './search.service';
import { TrashService } from './trash.service';

@ApiTags('drive')
@Controller()
export class DriveController {
  constructor(
    private readonly drive: DriveService,
    private readonly folders: FoldersService,
    private readonly media: MediaService,
    private readonly trash: TrashService,
    private readonly search: SearchService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Медиатека ----------

  @Get('drive')
  list(@CurrentUser() u: AuthUser, @Query() q: ListQuery) {
    return this.drive.list(u.id, q.folderId ?? null, q.sort ?? 'name', q.order ?? 'asc');
  }

  @Get('drive/recent')
  recent(@CurrentUser() u: AuthUser) {
    return this.drive.recent(u.id);
  }

  @Get('drive/starred')
  starred(@CurrentUser() u: AuthUser) {
    return this.drive.starred(u.id);
  }

  @Get('drive/tree')
  async tree(@CurrentUser() u: AuthUser) {
    return { folders: await this.folders.tree(u.id) };
  }

  // ---------- Папки ----------

  @Post('folders')
  async createFolder(@CurrentUser() u: AuthUser, @Body() dto: CreateFolderDto, @Req() req: Request) {
    const folder = await this.folders.create(u.id, dto.name, dto.parentId ?? null);
    await this.audit.record({ action: 'folder.create', actorId: u.id, targetType: 'folder', targetId: folder.id, req });
    return { folder };
  }

  @HttpCode(200)
  @Post('folders/ensure-path')
  async ensurePath(@CurrentUser() u: AuthUser, @Body() dto: EnsurePathDto) {
    return { folderId: await this.folders.ensurePath(u.id, dto.parentId ?? null, dto.segments) };
  }

  @Patch('folders/:id')
  async updateFolder(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFolderDto, @Req() req: Request) {
    const folder = await this.folders.update(u.id, id, dto);
    if (dto.parentId !== undefined) {
      await this.audit.record({ action: 'folder.move', actorId: u.id, targetType: 'folder', targetId: id, req, meta: { parentId: dto.parentId } });
    }
    return { folder };
  }

  @Delete('folders/:id')
  async deleteFolder(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.folders.trash(u.id, id);
    await this.audit.record({ action: 'folder.trash', actorId: u.id, targetType: 'folder', targetId: id, req });
    return { ok: true };
  }

  // ---------- Материалы ----------

  @Get('assets/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('open') open?: string) {
    return this.drive.detail(u.id, id, open === '1');
  }

  @Patch('assets/:id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssetDto) {
    return this.drive.update(u.id, id, dto);
  }

  @Delete('assets/:id')
  async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.drive.trashAsset(u.id, id);
    await this.audit.record({ action: 'asset.trash', actorId: u.id, targetType: 'asset', targetId: id, req });
    return { ok: true };
  }

  @HttpCode(200)
  @Post('assets/bulk')
  async bulk(@CurrentUser() u: AuthUser, @Body() dto: BulkDto, @Req() req: Request) {
    await this.drive.bulk(u.id, dto);
    await this.audit.record({
      action: `bulk.${dto.action}`,
      actorId: u.id,
      req,
      meta: { assets: dto.assetIds.length, folders: dto.folderIds.length, target: dto.targetFolderId ?? null },
    });
    return { ok: true };
  }

  /** Ссылка на скачивание оригинала (краткоживущая, выдаётся после проверки прав) */
  @HttpCode(200)
  @Post('assets/:id/download')
  download(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DownloadDto, @Req() req: Request) {
    return this.media.downloadUrl(u.id, id, dto.acknowledgeUnverified === true, req);
  }

  @Get('assets/:id/stream')
  stream(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.media.streamUrl(u.id, id);
  }

  /** HLS-плейлисты: права проверяются на каждый запрос, сегменты — по подписанным ссылкам */
  @Get('assets/:id/hls/:file')
  @Header('Content-Type', 'application/vnd.apple.mpegurl')
  @Header('Cache-Control', 'private, no-store')
  hls(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('file') file: string) {
    return file === 'master.m3u8' ? this.media.masterPlaylist(u.id, id) : this.media.variantPlaylist(u.id, id, file);
  }

  // ---------- Корзина ----------

  @Get('trash')
  listTrash(@CurrentUser() u: AuthUser) {
    return this.trash.list(u.id);
  }

  @HttpCode(200)
  @Post('trash/restore')
  async restore(@CurrentUser() u: AuthUser, @Body() dto: TrashItemsDto, @Req() req: Request) {
    await this.trash.restore(u.id, dto.folderIds, dto.assetIds, req);
    return { ok: true };
  }

  @HttpCode(200)
  @Post('trash/purge')
  purge(@CurrentUser() u: AuthUser, @Body() dto: TrashItemsDto, @Req() req: Request) {
    return this.trash.purge(u.id, dto.folderIds, dto.assetIds, req);
  }

  @HttpCode(200)
  @Post('trash/empty')
  empty(@CurrentUser() u: AuthUser, @Req() req: Request) {
    return this.trash.empty(u.id, req);
  }

  // ---------- Поиск ----------

  @Get('search')
  find(@CurrentUser() u: AuthUser, @Query() q: SearchQuery) {
    return this.search.search(u.id, q);
  }

  @Get('search/suggest')
  suggest(@CurrentUser() u: AuthUser, @Query('q') q = '') {
    return this.search.suggest(u.id, String(q).slice(0, 200));
  }
}
