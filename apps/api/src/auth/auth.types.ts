import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { MascotMode, PlanCode, Theme, UserRole } from '@ain/db';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  planCode: PlanCode;
  emailVerifiedAt: Date | null;
  locale: string;
  theme: Theme;
  mascotMode: MascotMode;
  onboardedAt: Date | null;
  blockedAt: Date | null;
  totpEnabledAt: Date | null;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
}

export const SESSION_COOKIE = 'ain_sid';
export const CSRF_COOKIE = 'ain_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Маршрут доступен без входа (пользователь всё равно подставляется, если есть сессия) */
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Маршрут доступен до подтверждения email */
export const ALLOW_UNVERIFIED = 'allowUnverified';
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED, true);

/** Маршрут только для сотрудников с указанными ролями */
export const ROLES = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user!;
});
