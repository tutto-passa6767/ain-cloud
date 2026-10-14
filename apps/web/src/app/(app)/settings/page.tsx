'use client';

import clsx from 'clsx';
import { Monitor } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { LanguageSwitch } from '@/components/app-shell';
import { useErrorText } from '@/components/drive/actions';
import { CloudIcon } from '@/components/mascot/cloud-icon';
import { useMascot } from '@/components/mascot/mascot-context';
import { useSession } from '@/components/providers';
import { useToast } from '@/components/toast';
import { TwoFactorPanel } from '@/components/two-factor';
import { Button, Input, ProgressBar } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/format';
import type { MascotMode } from '@/lib/types';

function Section({ title, children, text }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl glass p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {text && <p className="mt-1 text-sm text-muted">{text}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { t, locale, intl } = useI18n();
  const { user, me, updateUser, theme, setTheme } = useSession();
  const mascot = useMascot();
  const toast = useToast();
  const errText = useErrorText();
  const [name, setName] = useState(user?.name ?? '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const { data: sessions, mutate: reloadSessions } = useSWR<{ items: { id: string; current: boolean; lastSeenAt: string; ip: string | null; userAgent: string | null }[] }>('/auth/sessions');

  const usage = me?.usage;
  const plan = me?.plan;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-4 sm:px-6">
      <h1 className="text-lg font-semibold">{t('settings.title')}</h1>

      <Section title={t('settings.profile')}>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy('name');
            try {
              await updateUser({ name });
              toast(t('common.saved'), 'success');
            } catch (er) {
              toast(errText(er), 'error');
            } finally {
              setBusy(null);
            }
          }}
        >
          <div className="flex-1">
            <Input label={t('auth.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <Button type="submit" loading={busy === 'name'} disabled={!name.trim() || name === user?.name}>
            {t('common.save')}
          </Button>
        </form>
        <p className="mt-3 text-sm text-muted">{user?.email}</p>
      </Section>

      <Section title={t('settings.plan')}>
        {usage && plan && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{t('nav.plan', { plan: plan.name })}</span>
              <span className="text-muted">{t('settings.quota', { used: formatBytes(usage.usedBytes, locale), total: formatBytes(usage.quotaBytes, locale) })}</span>
            </div>
            <ProgressBar value={(usage.usedBytes / Math.max(1, usage.quotaBytes)) * 100} label={t('nav.storage')} />
            <p className="text-sm text-muted">
              {t('settings.maxFile', { size: formatBytes(plan.maxFileBytes, locale) })} · {t('settings.maxQuality', { q: plan.maxVideoHeight >= 2160 ? '4K' : `${plan.maxVideoHeight}p` })}
            </p>
          </div>
        )}
      </Section>

      <Section title={t('settings.appearance')}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
          <div>
            <p className="mb-2 text-sm font-medium">{t('common.language')}</p>
            <LanguageSwitch />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">{t('common.theme')}</p>
            <div role="radiogroup" className="flex rounded-lg border border-border p-0.5">
              {(['DARK', 'LIGHT'] as const).map((th) => (
                <button key={th} type="button" role="radio" aria-checked={theme === th} onClick={() => setTheme(th)} className={clsx('rounded-md px-3 py-1 text-sm', theme === th ? 'bg-surface-3 text-fg' : 'text-muted')}>
                  {th === 'DARK' ? t('common.dark') : t('common.light')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Переключатель «Облачко на сайте» хранится в аккаунте и действует на всех устройствах (ТЗ маскота §7, вариант 1) */}
      <Section title={t('settings.mascot')} text={t('settings.mascotText')}>
        <div role="radiogroup" aria-label={t('settings.mascot')} className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ['ON', t('settings.mascotOn')],
              ['COLLAPSED', t('settings.mascotCollapsed')],
              ['OFF', t('settings.mascotOff')],
            ] as [MascotMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={mascot.mode === mode}
              onClick={() => mascot.setMode(mode)}
              className={clsx('flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors', mascot.mode === mode ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2')}
            >
              <CloudIcon size={32} mood={mode === 'OFF' ? 'sleep' : mode === 'ON' ? 'happy' : 'idle'} className={mode === 'OFF' ? 'opacity-40' : undefined} />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('twofa.title')} text={t('twofa.text')}>
        <TwoFactorPanel />
      </Section>

      <Section title={t('settings.changePassword')}>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy('pw');
            try {
              await api('/auth/password/change', { method: 'POST', body: { currentPassword: pw.current, newPassword: pw.next } });
              setPw({ current: '', next: '' });
              toast(t('settings.passwordChanged'), 'success');
              void reloadSessions();
            } catch (er) {
              toast(errText(er), 'error');
            } finally {
              setBusy(null);
            }
          }}
        >
          <Input label={t('settings.currentPassword')} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />
          <Input label={t('auth.newPassword')} type="password" autoComplete="new-password" hint={t('auth.passwordHint')} value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
          <Button type="submit" loading={busy === 'pw'} disabled={!pw.current || pw.next.length < 10} className="sm:mb-5">
            {t('common.save')}
          </Button>
        </form>
      </Section>

      <Section title={t('settings.sessions')}>
        <ul className="divide-y divide-border">
          {(sessions?.items ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <Monitor className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" title={s.userAgent ?? ''}>
                  {s.current ? t('settings.thisDevice') : (s.userAgent ?? '—').slice(0, 80)}
                </p>
                <p className="text-xs text-muted">
                  {t('settings.lastSeen', { date: formatDate(s.lastSeenAt, intl, true) })}
                  {s.ip ? ` · ${s.ip}` : ''}
                </p>
              </div>
              {!s.current && (
                <Button
                  size="sm"
                  onClick={async () => {
                    await api(`/auth/sessions/${s.id}`, { method: 'DELETE' }).catch((er) => toast(errText(er), 'error'));
                    void reloadSessions();
                  }}
                >
                  {t('settings.endSession')}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {(sessions?.items.length ?? 0) > 1 && (
          <Button
            className="mt-3"
            onClick={async () => {
              await api('/auth/sessions/revoke-others', { method: 'POST' }).catch((er) => toast(errText(er), 'error'));
              void reloadSessions();
            }}
          >
            {t('settings.endOthers')}
          </Button>
        )}
      </Section>
    </div>
  );
}
