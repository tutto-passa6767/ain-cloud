'use client';

import Link from 'next/link';
import { BarysIcon } from '@/components/mascot/barys-icon';
import { useI18n } from '@/i18n';

/** 404 — Барыс растерян и объясняет, что делать (ТЗ §13.2) */
export default function NotFound() {
  const { t } = useI18n();
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <BarysIcon size={120} mood="confused" />
      <h1 className="text-2xl font-semibold">{t('common.notFoundTitle')}</h1>
      <p className="max-w-md text-muted">{t('common.notFoundText')}</p>
      <Link href="/drive" className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg hover:bg-accent-strong">
        {t('common.toDrive')}
      </Link>
    </main>
  );
}
