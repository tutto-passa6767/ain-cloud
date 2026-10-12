import { Controller, Get, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { Public } from './auth/auth.types';
import { SessionService } from './auth/session.service';
import { AccessService } from './common/access.service';
import { AuditService } from './common/audit.service';
import { CsrfMiddleware } from './common/csrf.middleware';
import { MailService } from './common/mail.service';
import { PrismaService } from './common/prisma.service';
import { QueueService } from './common/queue.service';
import { S3Service } from './common/s3.service';
import { SettingsService } from './common/settings.service';
import { AssetPresenter } from './drive/asset.presenter';
import { DriveController } from './drive/drive.controller';
import { DriveService } from './drive/drive.service';
import { FoldersService } from './drive/folders.service';
import { MediaService } from './drive/media.service';
import { SearchService } from './drive/search.service';
import { TrashService } from './drive/trash.service';
import { MeController } from './me/me.controller';
import { PublicLandingController, PublicShareController, SharesController } from './shares/shares.controller';
import { SharesService } from './shares/shares.service';
import { UploadsController } from './uploads/uploads.controller';
import { UploadsService } from './uploads/uploads.service';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])],
  controllers: [HealthController, AuthController, MeController, DriveController, UploadsController, SharesController, PublicShareController, PublicLandingController, AdminController],
  providers: [
    PrismaService,
    S3Service,
    AuditService,
    MailService,
    QueueService,
    SettingsService,
    AccessService,
    SessionService,
    AuthService,
    AssetPresenter,
    FoldersService,
    DriveService,
    MediaService,
    TrashService,
    SearchService,
    UploadsService,
    SharesService,
    AdminService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes('{*splat}');
  }
}
