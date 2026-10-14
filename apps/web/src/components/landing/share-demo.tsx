'use client';

import clsx from 'clsx';
import { CalendarClock, Download, EyeOff, Hash, Lock, Play } from 'lucide-react';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { formatBytes } from '@/lib/format';
import { AlmatyScene } from './almaty-scene';

type Opt = 'password' | 'expiry' | 'limit' | 'viewOnly';

const noop = () => () => {};
let week = 0;
const weekFromNow = () => (week ||= Date.now() + 7 * 86_400_000);

const FILE = { ru: 'Монтаж_финал_v3.mp4', kk: 'Монтаж_соңғы_v3.mp4', en: 'Final_cut_v3.mp4' } as const;

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      className={clsx('flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left text-sm transition-colors', on ? 'border-accent/40 bg-accent-soft' : 'border-border hover:bg-surface-2')}
    >
      {label}
      <span className={clsx('relative h-6 w-10 shrink-0 rounded-full transition-colors', on ? 'bg-accent-solid' : 'bg-surface-3')}>
        <span className={clsx('absolute top-1 size-4 rounded-full bg-white shadow transition-[left] duration-200', on ? 'left-5' : 'left-1')} />
      </span>
    </button>
  );
}

/** Конструктор ссылки: переключатели слева, справа — что увидит клиент */
export function ShareDemo({ intro }: { intro: ReactNode }) {
  const { t, intl, locale } = useI18n();
  const [opts, setOpts] = useState<Record<Opt, boolean>>({ password: true, expiry: true, limit: false, viewOnly: false });
  // Дата считается только в браузере: страница собирается заранее, и дата сборки устарела бы
  const inWeek = useSyncExternalStore(noop, weekFromNow, () => 0);
  const until = inWeek ? new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'long' }).format(inWeek) : '';
  const flip = (k: Opt) => setOpts((o) => ({ ...o, [k]: !o[k] }));

  return (
    <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr]">
      <div>
        {intro}
        <div className="mt-8 flex flex-col gap-2.5">
          <Toggle on={opts.password} label={t('landing.optPassword')} onChange={() => flip('password')} />
          <Toggle on={opts.expiry} label={t('landing.optExpiry')} onChange={() => flip('expiry')} />
          <Toggle on={opts.limit} label={t('landing.optLimit')} onChange={() => flip('limit')} />
          <Toggle on={opts.viewOnly} label={t('landing.optViewOnly')} onChange={() => flip('viewOnly')} />
        </div>
      </div>

      {/* Страница гостя */}
      <div className="glow-ring relative mx-auto w-full max-w-md rounded-[2rem] glass-strong p-3" aria-live="polite">
        <div className="mb-3 flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 font-mono text-[11px] text-subtle">
          <Lock className="size-3" />
          ain.kz/s/7fK2qM
        </div>
        <div className="relative overflow-hidden rounded-2xl">
          <AlmatyScene className="aspect-video w-full" />
          <span className="absolute left-2.5 top-2.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">4K</span>
          <span className="absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
            <Play className="ml-0.5 size-5" />
          </span>
        </div>
        <div className="px-2 pb-2 pt-4">
          <p className="text-xs text-subtle">{t('landing.guestFrom')}</p>
          <p className="mt-1 font-medium">{FILE[locale]}</p>
          <p className="font-mono text-[11px] text-subtle">3840×2160 · {formatBytes(2.4 * 1024 ** 3, locale)}</p>
          {(opts.expiry || opts.limit) && (
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {opts.expiry && until && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-muted">
                  <CalendarClock className="size-3.5" />
                  {t('landing.guestExpires', { date: until })}
                </span>
              )}
              {opts.limit && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-muted">
                  <Hash className="size-3.5" />
                  {t('landing.guestLeft')}
                </span>
              )}
            </div>
          )}
          {opts.password && (
            <div className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-border bg-bg-elevated px-3 text-sm text-subtle">
              <Lock className="size-4" />
              {t('landing.guestPassword')}
              <span className="ml-auto tracking-[0.3em] text-fg">••••••</span>
            </div>
          )}
          <div className="mt-3">
            {opts.viewOnly ? (
              <span className="flex h-10 items-center justify-center gap-2 rounded-full border border-border text-sm text-subtle">
                <EyeOff className="size-4" />
                {t('landing.guestViewOnly')}
              </span>
            ) : (
              <span className="btn-primary flex h-10 items-center justify-center gap-2 rounded-full text-sm font-medium">
                <Download className="size-4" />
                {t('landing.guestDownload')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
