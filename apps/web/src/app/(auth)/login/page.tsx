'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useErrorText } from '@/components/drive/actions';
import { AuthCard } from '@/components/public';
import { useSession } from '@/components/providers';
import { Button, Input } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, ApiError } from '@/lib/api';

/** Безопасный адрес возврата: только внутренние пути */
const safeNext = (v: string | null) => (v && v.startsWith('/') && !v.startsWith('//') ? v : '/drive');

function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const { user, refresh } = useSession();
  const errText = useErrorText();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const next = safeNext(params.get('next'));

  useEffect(() => {
    if (user) router.replace(user.emailVerifiedAt ? next : '/verify');
  }, [user, router, next]);

  if (mfaToken) {
    return (
      <AuthCard title={t('twofa.loginTitle')}>
        <p className="mb-4 text-sm text-muted">{t('twofa.loginText')}</p>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api('/auth/login/mfa', { method: 'POST', body: { mfaToken, code } });
              await refresh();
            } catch (er) {
              setError(errText(er));
              if (er instanceof ApiError && er.code === 'MFA_EXPIRED') setMfaToken(null);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input label={t('twofa.code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center font-mono text-lg tracking-[0.4em]" error={error} />
          <Button type="submit" variant="primary" loading={busy} disabled={code.length !== 6}>
            {t('auth.submitLogin')}
          </Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('auth.loginTitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link href="/signup" className="text-accent hover:underline">
            {t('nav.signup')}
          </Link>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const r = await api<{ mfaRequired?: boolean; mfaToken?: string }>('/auth/login', { method: 'POST', body: { email, password } });
            if (r.mfaRequired && r.mfaToken) setMfaToken(r.mfaToken);
            else await refresh();
          } catch (er) {
            setError(errText(er));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label={t('auth.password')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={busy}>
          {t('auth.submitLogin')}
        </Button>
        <Link href="/reset" className="text-center text-sm text-muted hover:text-fg">
          {t('auth.forgot')}
        </Link>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
