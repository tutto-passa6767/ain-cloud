import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomInt } from 'node:crypto';
import type { EmailCodePurpose } from '@ain/db';
import { cfg } from '../config';
import { AppError } from '../common/errors';
import { MailService } from '../common/mail.service';
import { PrismaService } from '../common/prisma.service';
import { SignupDto } from './auth.dto';
import { USER_SELECT } from './session.service';
import { decryptSecret, encryptSecret, generateSecret, otpauthUrl, readMfaToken, verifyTotp } from './totp';
import QRCode from 'qrcode';

/** Параметры Argon2id по рекомендации OWASP (ТЗ §10.1) */
const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const CODE_TTL_MIN = 15;
const CODE_MAX_ATTEMPTS = 5;

const codeHash = (userId: string, code: string) => createHash('sha256').update(`${userId}:${code}`).digest('hex');

@Injectable()
export class AuthService {
  private readonly log = new Logger('Auth');
  /** Хеш-приманка: при входе с несуществующим email тратим столько же времени, сколько на проверку пароля */
  private dummyHash = argon2.hash('ain-dummy-password', ARGON);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'Этот email уже зарегистрирован');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash: await argon2.hash(dto.password, ARGON),
        locale: dto.locale ?? 'ru',
        pdConsentAt: new Date(),
      },
      select: USER_SELECT,
    });
    await this.issueCode(user.id, user.email, user.locale, 'VERIFY_EMAIL');
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await argon2.verify(await this.dummyHash, password).catch(() => false);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(429, 'ACCOUNT_LOCKED', 'Слишком много попыток входа. Попробуйте позже', {
        retryAfterSec: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000),
      });
    }
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
        },
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
    }
    if (user.blockedAt) throw new AppError(403, 'ACCOUNT_BLOCKED', 'Аккаунт заблокирован');
    if (user.failedLogins || user.lockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    }
    return this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: USER_SELECT });
  }

  /** Второй шаг входа: код из приложения-аутентификатора */
  async loginMfa(token: string, code: string) {
    const userId = readMfaToken(token);
    if (!userId) throw new AppError(401, 'MFA_EXPIRED', 'Время на ввод кода истекло — войдите заново');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.totpSecret || !user.totpEnabledAt) throw new AppError(401, 'MFA_EXPIRED', 'Войдите заново');
    if (!verifyTotp(decryptSecret(user.totpSecret), code)) throw new AppError(401, 'INVALID_CODE', 'Неверный код');
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: USER_SELECT });
  }

  /** Подготовка 2FA: новый секрет сохраняется, но действует только после подтверждения кодом */
  async setupTotp(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabledAt) throw new AppError(409, 'MFA_ALREADY_ENABLED', 'Двухфакторная аутентификация уже включена');
    const secret = generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: encryptSecret(secret) } });
    const url = otpauthUrl(secret, user.email);
    return { secret, otpauthUrl: url, qrSvg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 200 }) };
  }

  async enableTotp(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecret) throw new AppError(409, 'MFA_NOT_SETUP', 'Сначала получите ключ');
    if (!verifyTotp(decryptSecret(user.totpSecret), code)) throw new AppError(400, 'INVALID_CODE', 'Неверный код');
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date() } });
  }

  async disableTotp(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role !== 'USER') throw new AppError(403, 'MFA_MANDATORY', 'Для сотрудников 2FA отключить нельзя');
    if (!user.totpSecret || !user.totpEnabledAt) return;
    if (!verifyTotp(decryptSecret(user.totpSecret), code)) throw new AppError(400, 'INVALID_CODE', 'Неверный код');
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: null, totpSecret: null } });
  }

  async issueCode(userId: string, email: string, locale: string, purpose: EmailCodePurpose) {
    // Не чаще одного письма в минуту
    const recent = await this.prisma.emailCode.findFirst({
      where: { userId, purpose, createdAt: { gt: new Date(Date.now() - 60_000) } },
    });
    if (recent) throw new AppError(429, 'CODE_RECENTLY_SENT', 'Код уже отправлен, подождите минуту');

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction([
      this.prisma.emailCode.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.emailCode.create({
        data: { userId, purpose, codeHash: codeHash(userId, code), expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000) },
      }),
    ]);
    if (!cfg.isProduction) this.log.log(`[dev] ${purpose} для ${email}: ${code}`);
    if (purpose === 'VERIFY_EMAIL') await this.mail.sendVerificationCode(email, code, locale);
    else await this.mail.sendPasswordResetCode(email, code, locale);
  }

  /** Проверка кода: ограничение попыток, одноразовость, срок действия */
  async consumeCode(userId: string, purpose: EmailCodePurpose, code: string) {
    const row = await this.prisma.emailCode.findFirst({
      where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.attempts >= CODE_MAX_ATTEMPTS) {
      throw new AppError(400, 'CODE_EXPIRED', 'Код устарел — запросите новый');
    }
    if (row.codeHash !== codeHash(userId, code)) {
      await this.prisma.emailCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      throw new AppError(400, 'INVALID_CODE', 'Неверный код');
    }
    await this.prisma.emailCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  }

  async verifyEmail(userId: string, code: string) {
    await this.consumeCode(userId, 'VERIFY_EMAIL', code);
    return this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() }, select: USER_SELECT });
  }

  async requestReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Ответ одинаковый вне зависимости от наличия аккаунта — не раскрываем, кто зарегистрирован
    if (!user) return;
    await this.issueCode(user.id, user.email, user.locale, 'RESET_PASSWORD').catch((e) => {
      if (!(e instanceof AppError)) throw e;
    });
  }

  async confirmReset(email: string, code: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(400, 'CODE_EXPIRED', 'Код устарел — запросите новый');
    await this.consumeCode(user.id, 'RESET_PASSWORD', code);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argon2.hash(password, ARGON), failedLogins: 0, lockedUntil: null, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    });
    return user.id;
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, current).catch(() => false))) {
      throw new AppError(400, 'INVALID_CREDENTIALS', 'Текущий пароль указан неверно');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(next, ARGON) } });
  }
}
