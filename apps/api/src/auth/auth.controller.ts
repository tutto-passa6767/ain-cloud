import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AppError } from '../common/errors';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { ChangePasswordDto, ConfirmResetDto, LoginDto, MfaLoginDto, RequestResetDto, SignupDto, TotpCodeDto, VerifyEmailDto } from './auth.dto';
import { mfaToken } from './totp';
import { AuthService } from './auth.service';
import { AllowUnverified, AuthedRequest, AuthUser, CurrentUser, Public } from './auth.types';
import { SessionService } from './session.service';

const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  /** Выдаёт CSRF-cookie перед первым изменяющим запросом */
  @Public()
  @Get('csrf')
  csrf() {
    return { ok: true };
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.signup(dto);
    const token = await this.sessions.create(user.id, req.ip, req.headers['user-agent']);
    this.sessions.setCookie(res, token);
    await this.audit.record({ action: 'auth.signup', actorId: user.id, targetType: 'user', targetId: user.id, req, meta: { pdConsent: true } });
    return { user };
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    try {
      const user = await this.auth.login(dto.email, dto.password);
      // С включённой 2FA сессия выдаётся только после кода из приложения
      if (user.totpEnabledAt) return { mfaRequired: true, mfaToken: mfaToken(user.id) };
      const token = await this.sessions.create(user.id, req.ip, req.headers['user-agent']);
      this.sessions.setCookie(res, token);
      await this.audit.record({ action: 'auth.login', actorId: user.id, targetType: 'user', targetId: user.id, req });
      return { user };
    } catch (e) {
      if (e instanceof AppError) {
        await this.audit.record({ action: 'auth.login_failed', req, meta: { email: dto.email, code: (e.getResponse() as any).code } });
      }
      throw e;
    }
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('login/mfa')
  async loginMfa(@Body() dto: MfaLoginDto, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    try {
      const user = await this.auth.loginMfa(dto.mfaToken, dto.code);
      const token = await this.sessions.create(user.id, req.ip, req.headers['user-agent']);
      this.sessions.setCookie(res, token);
      await this.audit.record({ action: 'auth.login', actorId: user.id, targetType: 'user', targetId: user.id, req, meta: { mfa: true } });
      return { user };
    } catch (e) {
      await this.audit.record({ action: 'auth.mfa_failed', req });
      throw e;
    }
  }

  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('2fa/setup')
  setup2fa(@CurrentUser() user: AuthUser) {
    return this.auth.setupTotp(user.id);
  }

  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('2fa/enable')
  async enable2fa(@CurrentUser() user: AuthUser, @Body() dto: TotpCodeDto, @Req() req: AuthedRequest) {
    await this.auth.enableTotp(user.id, dto.code);
    await this.audit.record({ action: 'auth.2fa_enabled', actorId: user.id, targetType: 'user', targetId: user.id, req });
    return { ok: true };
  }

  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('2fa/disable')
  async disable2fa(@CurrentUser() user: AuthUser, @Body() dto: TotpCodeDto, @Req() req: AuthedRequest) {
    await this.auth.disableTotp(user.id, dto.code);
    await this.audit.record({ action: 'auth.2fa_disabled', actorId: user.id, targetType: 'user', targetId: user.id, req });
    return { ok: true };
  }

  @AllowUnverified()
  @HttpCode(200)
  @Post('logout')
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    if (req.sessionId) await this.sessions.revoke(req.sessionId);
    this.sessions.clearCookie(res);
    await this.audit.record({ action: 'auth.logout', actorId: req.user?.id, req });
    return { ok: true };
  }

  @AllowUnverified()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('verify-email')
  async verifyEmail(@CurrentUser() user: AuthUser, @Body() dto: VerifyEmailDto, @Req() req: AuthedRequest) {
    if (user.emailVerifiedAt) return { user };
    const updated = await this.auth.verifyEmail(user.id, dto.code);
    await this.audit.record({ action: 'auth.email_verified', actorId: user.id, targetType: 'user', targetId: user.id, req });
    return { user: updated };
  }

  @AllowUnverified()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('resend-code')
  async resend(@CurrentUser() user: AuthUser) {
    if (user.emailVerifiedAt) return { ok: true };
    await this.auth.issueCode(user.id, user.email, user.locale, 'VERIFY_EMAIL');
    return { ok: true };
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('password/reset-request')
  async resetRequest(@Body() dto: RequestResetDto, @Req() req: AuthedRequest) {
    await this.auth.requestReset(dto.email);
    await this.audit.record({ action: 'auth.password_reset_requested', req, meta: { email: dto.email } });
    return { ok: true };
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('password/reset-confirm')
  async resetConfirm(@Body() dto: ConfirmResetDto, @Req() req: AuthedRequest) {
    const userId = await this.auth.confirmReset(dto.email, dto.code, dto.password);
    // После смены пароля все сессии завершаются
    await this.sessions.revokeAllExcept(userId);
    await this.audit.record({ action: 'auth.password_reset', actorId: userId, targetType: 'user', targetId: userId, req });
    return { ok: true };
  }

  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('password/change')
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Req() req: AuthedRequest) {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    await this.sessions.revokeAllExcept(user.id, req.sessionId);
    await this.audit.record({ action: 'auth.password_changed', actorId: user.id, targetType: 'user', targetId: user.id, req });
    return { ok: true };
  }

  /** Активные сессии (ТЗ §4.1) */
  @AllowUnverified()
  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthUser, @Req() req: AuthedRequest) {
    const rows = await this.prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return {
      items: rows.map((s) => ({
        id: s.id.slice(0, 16),
        current: s.id === req.sessionId,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        ip: s.ip,
        userAgent: s.userAgent,
      })),
    };
  }

  @AllowUnverified()
  @Delete('sessions/:id')
  async revokeSession(@CurrentUser() user: AuthUser, @Param('id') shortId: string, @Req() req: AuthedRequest) {
    if (!/^[0-9a-f]{16}$/.test(shortId)) throw new AppError(400, 'BAD_REQUEST', 'Неверный идентификатор сессии');
    const session = await this.prisma.session.findFirst({ where: { userId: user.id, id: { startsWith: shortId }, revokedAt: null } });
    if (!session) throw new AppError(404, 'NOT_FOUND', 'Сессия не найдена');
    await this.sessions.revoke(session.id);
    await this.audit.record({ action: 'auth.session_revoked', actorId: user.id, targetType: 'session', targetId: shortId, req });
    return { ok: true };
  }

  @AllowUnverified()
  @HttpCode(200)
  @Post('sessions/revoke-others')
  async revokeOthers(@CurrentUser() user: AuthUser, @Req() req: AuthedRequest) {
    await this.sessions.revokeAllExcept(user.id, req.sessionId);
    await this.audit.record({ action: 'auth.sessions_revoked', actorId: user.id, req });
    return { ok: true };
  }
}
