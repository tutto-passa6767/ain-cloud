import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@ain/db';
import { AppError } from '../common/errors';
import { ALLOW_UNVERIFIED, AuthedRequest, IS_PUBLIC, ROLES, SESSION_COOKIE } from './auth.types';
import { SessionService } from './session.service';

/**
 * Глобальная проверка входа. Все проверки прав — на сервере (ТЗ §4.3):
 * скрытая кнопка в интерфейсе не заменяет проверку API.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);

    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      const resolved = await this.sessions.resolve(token);
      if (resolved) {
        req.user = resolved.user;
        req.sessionId = resolved.sessionId;
      }
    }
    if (isPublic) return true;

    const user = req.user;
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Требуется вход');
    if (user.blockedAt) throw new AppError(403, 'ACCOUNT_BLOCKED', 'Аккаунт заблокирован');

    const allowUnverified = this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED, targets);
    if (!allowUnverified && !user.emailVerifiedAt) {
      throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Подтвердите email');
    }

    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES, targets);
    if (roles?.length) {
      if (!roles.includes(user.role)) throw new AppError(403, 'FORBIDDEN', 'Недостаточно прав');
      if (!user.totpEnabledAt) throw new AppError(403, 'MFA_REQUIRED', 'Для сотрудников обязательна двухфакторная аутентификация');
    }
    return true;
  }
}
