'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useErrorText } from '@/components/drive/actions';
import { AuthCard } from '@/components/public';
import { useSession } from '@/components/providers';
import { useToast } from '@/components/toast';
import { Button, Input, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';

/** Подтверждение email кодом из письма (ТЗ §4.1) */
export default function VerifyPage() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { user, loading, refresh } = useSession();
  const errText = useErrorText();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.emailVerifiedAt) router.replace('/drive');
  }, [user, loading, router]);

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <AuthCard title={t('auth.verifyTitle')}>
      <p className="mb-4 text-sm text-muted">{t('auth.verifyText', { email: user.email })}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api('/auth/verify-email', { method: 'POST', body: { code } });
            await refresh();
          } catch (er) {
            setError(errText(er));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          label={t('auth.code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="text-center font-mono text-lg tracking-[0.4em]"
          error={error}
        />
        <Button type="submit" variant="primary" loading={busy} disabled={code.length !== 6}>
          {t('auth.verify')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            try {
              await api('/auth/resend-code', { method: 'POST' });
              toast(t('auth.resent'), 'success');
            } catch (er) {
              toast(errText(er), 'error');
            }
          }}
        >
          {t('auth.resend')}
        </Button>
      </form>
    </AuthCard>
  );
}
