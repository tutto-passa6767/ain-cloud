'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useErrorText } from '@/components/drive/actions';
import { AuthCard } from '@/components/public';
import { Button, Input } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';

/** Восстановление пароля по коду из письма (ТЗ §4.1) */
export default function ResetPage() {
  const { t } = useI18n();
  const errText = useErrorText();
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title={t('auth.resetTitle')}
      footer={
        <Link href="/login" className="text-accent hover:underline">
          {t('nav.login')}
        </Link>
      }
    >
      {step === 'email' && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('/auth/password/reset-request', { method: 'POST', body: { email } });
              setStep('code');
            });
          }}
        >
          <p className="text-sm text-muted">{t('auth.resetText')}</p>
          <Input label={t('auth.email')} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
          <Button type="submit" variant="primary" loading={busy}>
            {t('auth.sendCode')}
          </Button>
        </form>
      )}
      {step === 'code' && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('/auth/password/reset-confirm', { method: 'POST', body: { email, code, password } });
              setStep('done');
            });
          }}
        >
          <p className="text-sm text-muted">{t('auth.verifyText', { email })}</p>
          <Input label={t('auth.code')} inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <Input label={t('auth.newPassword')} type="password" autoComplete="new-password" minLength={10} required hint={t('auth.passwordHint')} value={password} onChange={(e) => setPassword(e.target.value)} error={error} />
          <Button type="submit" variant="primary" loading={busy}>
            {t('auth.setPassword')}
          </Button>
        </form>
      )}
      {step === 'done' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm">{t('auth.resetDone')}</p>
          <Link href="/login" className="btn-primary rounded-full px-4 py-2.5 text-center text-sm font-medium">
            {t('nav.login')}
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
