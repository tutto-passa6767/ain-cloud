'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { LanguageSwitch, ThemeToggle } from './app-shell';
import { BarysIcon } from './mascot/barys-icon';
import { webglAvailable } from './mascot/barys-scene';
import { useSession } from './providers';

const BarysCanvas = dynamic(() => import('./mascot/barys-canvas'), { ssr: false });

/** anchors — ссылки на разделы главной; на остальных публичных страницах — «Тарифы» и «Помощь» */
export function PublicHeader({ anchors }: { anchors?: { href: string; label: string }[] } = {}) {
  const { t } = useI18n();
  const { user } = useSession();
  return (
    <header className="sticky top-0 z-20 glass border-x-0 border-t-0">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <BarysIcon size={28} />
          AIN Cloud
        </Link>
        <nav className="ml-4 hidden items-center gap-5 text-sm text-muted md:flex">
          {anchors ? (
            anchors.map((a) => (
              <a key={a.href} href={a.href} className="hover:text-fg">
                {a.label}
              </a>
            ))
          ) : (
            <>
              <Link href="/pricing" className="hover:text-fg">
                {t('nav.pricing')}
              </Link>
              <Link href="/help" className="hover:text-fg">
                {t('nav.help')}
              </Link>
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <LanguageSwitch />
          </div>
          <ThemeToggle />
          {user ? (
            <Link href="/drive" className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-strong">
              {t('nav.drive')}
            </Link>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
                {t('nav.login')}
              </Link>
              <Link href="/signup" className="hidden rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-strong sm:block">
                {t('nav.signup')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <p>{t('landing.footer')}</p>
          <LanguageSwitch compact />
        </div>
        <nav className="flex flex-wrap gap-4">
          <Link href="/terms" className="hover:text-fg">
            {t('legal.terms')}
          </Link>
          <Link href="/privacy" className="hover:text-fg">
            {t('legal.privacy')}
          </Link>
          <Link href="/offer" className="hover:text-fg">
            {t('legal.offer')}
          </Link>
          <Link href="/help" className="hover:text-fg">
            {t('nav.help')}
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

/** Барыс на подставке машет лапой — первый экран лендинга (ТЗ §13.2, «Привет») */
export function HeroMascot() {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // Модель грузится после основного содержимого: на LCP не влияет
    const go = () => setWebgl(webglAvailable());
    if (document.readyState === 'complete') setTimeout(go, 200);
    else window.addEventListener('load', go, { once: true });
  }, []);
  return (
    <div className="relative mx-auto flex h-[340px] w-[300px] items-end justify-center sm:h-[420px] sm:w-[380px]">
      <div className="absolute inset-x-6 bottom-6 h-24 rounded-full bg-accent/10 blur-3xl" />
      {webgl ? (
        <BarysCanvas pose="wave" pedestal walking={0} reducedMotion={reduced} width={380} height={420} />
      ) : webgl === false ? (
        <BarysIcon size={220} mood="wave" />
      ) : null}
    </div>
  );
}

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <BarysIcon size={28} />
          AIN Cloud
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <ThemeToggle />
        </div>
      </div>
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl glass-strong p-6">
            <h1 className="mb-5 text-xl font-semibold">{title}</h1>
            {children}
          </div>
          {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
          <p className="mt-6 text-center text-xs text-subtle">{t('auth.secureConnection')}</p>
        </div>
      </main>
    </div>
  );
}
