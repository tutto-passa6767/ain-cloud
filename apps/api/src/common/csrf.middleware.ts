import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { cfg } from '../config';
import { CSRF_COOKIE, CSRF_HEADER } from '../auth/auth.types';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Защита от CSRF (ТЗ §10.1): double-submit cookie. Изменяющий запрос должен прислать
 * в заголовке значение из cookie, которое чужой сайт прочитать не может. Плюс SameSite=Lax у сессии.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    let token: string | undefined = req.cookies?.[CSRF_COOKIE];
    if (!token) {
      token = randomBytes(24).toString('base64url');
      res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: cfg.cookieSecure, sameSite: 'lax', path: '/' });
      req.cookies = { ...(req.cookies ?? {}), [CSRF_COOKIE]: token };
    }

    if (!SAFE.has(req.method)) {
      const header = req.header(CSRF_HEADER) ?? '';
      const a = Buffer.from(header);
      const b = Buffer.from(token);
      if (!header || a.length !== b.length || !timingSafeEqual(a, b)) {
        res.status(403).json({ statusCode: 403, code: 'CSRF_FAILED', message: 'Обновите страницу и повторите действие' });
        return;
      }
    }
    next();
  }
}
