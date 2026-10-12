import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { cfg } from '../config';
import { PrismaService } from '../common/prisma.service';
import { AuthUser, SESSION_COOKIE } from './auth.types';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  planCode: true,
  emailVerifiedAt: true,
  locale: true,
  theme: true,
  mascotMode: true,
  onboardedAt: true,
  blockedAt: true,
  totpEnabledAt: true,
} as const;

/**
 * Серверные сессии: в cookie — случайный токен, в БД — только его хеш.
 * Пользователь видит активные сессии и может завершить любую (ТЗ §4.1).
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, ip?: string, userAgent?: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: {
        id: sha256(token),
        userId,
        ip,
        userAgent: userAgent?.slice(0, 400),
        expiresAt: new Date(Date.now() + cfg.sessionTtlDays * 86400_000),
      },
    });
    return token;
  }

  async resolve(token: string): Promise<{ sessionId: string; user: AuthUser } | null> {
    const id = sha256(token);
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: { user: { select: USER_SELECT } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
    // Отметку активности обновляем не чаще раза в 5 минут
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
      await this.prisma.session.update({ where: { id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
    return { sessionId: id, user: session.user };
  }

  async revoke(sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllExcept(userId: string, keepSessionId?: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(keepSessionId ? { NOT: { id: keepSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  setCookie(res: Response, token: string) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: cfg.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: cfg.sessionTtlDays * 86400_000,
    });
  }

  clearCookie(res: Response) {
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: cfg.cookieSecure, sameSite: 'lax', path: '/' });
  }
}
