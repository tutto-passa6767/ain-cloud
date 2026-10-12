'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useSession } from '@/components/providers';
import { TwoFactorPanel } from '@/components/two-factor';
import { useI18n } from '@/i18n';
import type { User } from '@/lib/types';

type Role = User['role'];

/** Разделы админ-панели и роли сотрудников, которым они доступны (ТЗ §15) */
const ADMIN_TABS: { href: string; key: 'dashboard' | 'users' | 'reports' | 'files' | 'audit' | 'settings'; roles: Role[] }[] = [
  { href: '/admin', key: 'dashboard', roles: ['ADMIN', 'MODERATOR', 'SUPPORT', 'ACCOUNTANT'] },
  { href: '/admin/users', key: 'users', roles: ['ADMIN', 'SUPPORT'] },
  { href: '/admin/reports', key: 'reports', roles: ['ADMIN', 'MODERATOR'] },
  { href: '/admin/files', key: 'files', roles: ['ADMIN', 'MODERATOR', 'SUPPORT'] },
  { href: '/admin/audit', key: 'audit', roles: ['ADMIN'] },
  { href: '/admin/settings', key: 'settings', roles: ['ADMIN'] },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user } = useSession();
  const pathname = usePathname();
  if (!user || user.role === 'USER') {
    return <p className="px-6 py-10 text-muted">{t('errors.FORBIDDEN')}</p>;
  }
  // Сотрудник без 2FA сначала её включает (ТЗ §4.1)
  if (!user.totpEnabledAt) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-2 text-lg font-semibold">{t('admin.title')}</h1>
        <p className="mb-5 text-sm text-warning">{t('twofa.staffRequired')}</p>
        <div className="rounded-xl glass p-5">
          <TwoFactorPanel />
        </div>
      </div>
    );
  }
  const tabs = ADMIN_TABS.filter((tab) => tab.roles.includes(user.role));
  const current = ADMIN_TABS.find((tab) => (tab.href === '/admin' ? pathname === '/admin' : pathname.startsWith(tab.href)));
  return (
    <div className="flex flex-col gap-4 px-3 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">{t('admin.title')}</h1>
        <nav className="flex flex-wrap gap-1 rounded-xl border border-border p-1" aria-label={t('admin.title')}>
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={current?.href === tab.href ? 'page' : undefined}
              className={clsx('rounded-lg px-3 py-1.5 text-sm', current?.href === tab.href ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg')}
            >
              {t(`admin.nav.${tab.key}`)}
            </Link>
          ))}
        </nav>
      </div>
      {current && !current.roles.includes(user.role) ? <p className="text-muted">{t('admin.noAccess')}</p> : children}
    </div>
  );
}
