'use client';

import clsx from 'clsx';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { LanguageSwitch, ThemeToggle } from './app-shell';
import { CloudIcon } from './mascot/cloud-icon';
import { useSession } from './providers';

/** «*слово*» — курсивный тлеющий акцент */
function rich(s: string) {
  return s.split(/(\*[^*]+\*)/).map((part, i) => (part.length > 2 && part.startsWith('*') && part.endsWith('*') ? <em key={i}>{part.slice(1, -1)}</em> : part));
}

/** Крупный заголовок в два тона: «первая строка|вторая строка», вторая — стальная */
export function RichTitle({ text, as: Tag = 'h2', className, id }: { text: string; as?: 'h1' | 'h2' | 'h3'; className?: string; id?: string }) {
  const [first, second] = text.split('|');
  return (
    <Tag id={id} className={clsx('display', className)}>
      {rich(first)}
      {second !== undefined && (
        <>
          {' '}
          <span className="tone block">{rich(second)}</span>
        </>
      )}
    </Tag>
  );
}

/** Призыв к действию: тлеющая пилюля с белым кружком-стрелкой */
export function CtaLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={clsx('btn-ember inline-flex h-12 items-center justify-between gap-4 rounded-full pl-6 pr-1.5 text-sm font-medium', className)}>
      <span>{children}</span>
      <span className="arrow flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-black">
        <ArrowUpRight className="size-4" />
      </span>
    </Link>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <CloudIcon size={28} />
      AIN Cloud
    </Link>
  );
}

/** anchors — ссылки на разделы главной; на остальных публичных страницах — «Тарифы» и «Помощь» */
export function PublicHeader({ anchors }: { anchors?: { href: string; label: string }[] } = {}) {
  const { t } = useI18n();
  const { user } = useSession();
  const links = anchors ?? [
    { href: '/pricing', label: t('nav.pricing') },
    { href: '/help', label: t('nav.help') },
  ];
  return (
    <header className="sticky top-0 z-30 px-3 pt-3">
      <div className="glass mx-auto flex h-14 max-w-6xl items-center gap-3 rounded-full pl-4 pr-2 shadow-pop">
        <Brand />
        <nav className="mx-auto hidden items-center gap-0.5 rounded-full border border-border bg-surface-2 p-1 text-sm md:flex">
          {links.map((a) =>
            a.href.startsWith('#') ? (
              <a key={a.href} href={a.href} className="rounded-full px-3.5 py-1.5 text-muted transition-colors hover:bg-surface-3 hover:text-fg">
                {a.label}
              </a>
            ) : (
              <Link key={a.href} href={a.href} className="rounded-full px-3.5 py-1.5 text-muted transition-colors hover:bg-surface-3 hover:text-fg">
                {a.label}
              </Link>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <div className="hidden sm:block">
            <LanguageSwitch />
          </div>
          <ThemeToggle />
          {user ? (
            <Link href="/drive" className="btn-primary rounded-full px-4 py-2 text-sm font-medium">
              {t('nav.drive')}
            </Link>
          ) : (
            <>
              <Link href="/login" className="rounded-full px-3.5 py-2 text-sm transition-colors hover:bg-surface-2">
                {t('nav.login')}
              </Link>
              <Link href="/signup" className="btn-primary hidden rounded-full px-4 py-2 text-sm font-medium sm:block">
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
  const link = 'text-muted transition-colors hover:text-fg';
  return (
    <footer className="relative mt-auto border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 md:flex-row md:items-start md:justify-between">
        <Brand />
        <nav className="grid grid-cols-2 gap-x-14 gap-y-2.5 text-sm sm:flex sm:gap-8" aria-label="AIN Cloud">
          <Link href="/pricing" className={link}>
            {t('nav.pricing')}
          </Link>
          <Link href="/help" className={link}>
            {t('nav.help')}
          </Link>
          <Link href="/terms" className={link}>
            {t('legal.terms')}
          </Link>
          <Link href="/privacy" className={link}>
            {t('legal.privacy')}
          </Link>
          <Link href="/offer" className={link}>
            {t('legal.offer')}
          </Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-subtle">
          <p>{t('landing.footer')}</p>
          <LanguageSwitch compact />
        </div>
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

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <Brand />
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <ThemeToggle />
        </div>
      </div>
      <main id="main" className="relative flex flex-1 items-center justify-center px-4 py-8">
        <div className="ember-glow pointer-events-none absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 opacity-60" aria-hidden />
        <div className="relative w-full max-w-sm">
          <div className="glow-ring rounded-3xl glass-strong p-7">
            <h1 className="display mb-6 text-3xl">{title}</h1>
            {children}
          </div>
          {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
          <p className="mt-6 text-center text-xs text-subtle">{t('auth.secureConnection')}</p>
        </div>
      </main>
    </div>
  );
}
