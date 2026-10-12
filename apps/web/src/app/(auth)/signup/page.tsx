'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useErrorText } from '@/components/drive/actions';
import { AuthCard } from '@/components/public';
import { useSession } from '@/components/providers';
import { Button, Input } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';

export default function SignupPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { user, refresh } = useSession();
  const errText = useErrorText();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace(user.emailVerifiedAt ? '/drive' : '/verify');
  }, [user, router]);

  const consentText = t('auth.consent', { privacy: '\u0000', terms: '\u0001' }).split(/(\u0000|\u0001)/);

  return (
    <AuthCard
      title={t('auth.signupTitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link href="/login" className="text-accent hover:underline">
            {t('nav.login')}
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
            await api('/auth/signup', { method: 'POST', body: { ...form, locale, pdConsent: consent } });
            await refresh();
            router.replace('/verify');
          } catch (er) {
            setError(errText(er));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input label={t('auth.name')} autoComplete="name" required maxLength={100} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input label={t('auth.email')} type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <Input label={t('auth.password')} type="password" autoComplete="new-password" required minLength={10} hint={t('auth.passwordHint')} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        {/* Согласие на обработку персональных данных при регистрации (ТЗ §10.2) */}
        <label className="flex items-start gap-2.5 text-sm text-muted">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" required />
          <span>
            {consentText.map((part, i) =>
              part === '\u0000' ? (
                <Link key={i} href="/privacy" target="_blank" className="text-accent hover:underline">
                  {t('auth.consentPrivacy')}
                </Link>
              ) : part === '\u0001' ? (
                <Link key={i} href="/terms" target="_blank" className="text-accent hover:underline">
                  {t('auth.consentTerms')}
                </Link>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={busy} disabled={!consent}>
          {t('auth.submitSignup')}
        </Button>
      </form>
    </AuthCard>
  );
}
