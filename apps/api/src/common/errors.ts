import { HttpException } from '@nestjs/common';

/**
 * Ошибка API с машиночитаемым кодом (ТЗ §11: «ошибки — с понятными кодами и сообщениями»).
 * Интерфейс показывает локализованный текст по коду, `message` — запасной вариант на русском.
 */
export class AppError extends HttpException {
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super({ statusCode: status, code, message, ...(details ? { details } : {}) }, status);
  }
}

export const notFound = (what = 'Объект') => new AppError(404, 'NOT_FOUND', `${what} не найден`);
