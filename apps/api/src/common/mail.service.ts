import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { cfg } from '../config';

type Locale = 'ru' | 'kk' | 'en';

const texts: Record<Locale, { verifySubject: string; verifyBody: (c: string) => string; resetSubject: string; resetBody: (c: string) => string }> = {
  ru: {
    verifySubject: 'Код подтверждения AIN Cloud',
    verifyBody: (c) => `Ваш код подтверждения: ${c}\n\nКод действует 15 минут. Если вы не регистрировались в AIN Cloud, просто проигнорируйте письмо.`,
    resetSubject: 'Восстановление пароля AIN Cloud',
    resetBody: (c) => `Код для смены пароля: ${c}\n\nКод действует 15 минут. Если вы не запрашивали смену пароля, проигнорируйте письмо — пароль останется прежним.`,
  },
  kk: {
    verifySubject: 'AIN Cloud растау коды',
    verifyBody: (c) => `Растау кодыңыз: ${c}\n\nКод 15 минут жарамды. Егер сіз AIN Cloud-та тіркелмеген болсаңыз, хатты елемеңіз.`,
    resetSubject: 'AIN Cloud құпиясөзін қалпына келтіру',
    resetBody: (c) => `Құпиясөзді ауыстыру коды: ${c}\n\nКод 15 минут жарамды. Егер сіз сұрамаған болсаңыз, хатты елемеңіз — құпиясөз өзгермейді.`,
  },
  en: {
    verifySubject: 'Your AIN Cloud verification code',
    verifyBody: (c) => `Your verification code: ${c}\n\nThe code is valid for 15 minutes. If you did not sign up for AIN Cloud, please ignore this email.`,
    resetSubject: 'AIN Cloud password reset',
    resetBody: (c) => `Your password reset code: ${c}\n\nThe code is valid for 15 minutes. If you did not request a reset, ignore this email — your password stays the same.`,
  },
};

const pick = (locale: string): Locale => (locale === 'kk' || locale === 'en' ? locale : 'ru');

@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private readonly transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.password } : undefined,
  });

  async sendVerificationCode(to: string, code: string, locale: string) {
    const t = texts[pick(locale)];
    await this.send(to, t.verifySubject, t.verifyBody(code));
  }

  async sendPasswordResetCode(to: string, code: string, locale: string) {
    const t = texts[pick(locale)];
    await this.send(to, t.resetSubject, t.resetBody(code));
  }

  private async send(to: string, subject: string, text: string) {
    try {
      await this.transport.sendMail({ from: cfg.smtp.from, to, subject, text });
    } catch (e) {
      this.log.error(`Письмо не отправлено: ${(e as Error).message}`);
      throw e;
    }
  }
}
