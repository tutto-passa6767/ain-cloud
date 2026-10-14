'use client';

import Link from 'next/link';
import { MascotStage } from '@/components/mascot/mascot-stage';
import { useI18n } from '@/i18n';

/** 404 — Облачко растеряно и предлагает вернуться в «Мои файлы» (ТЗ маскота §5, §8.1) */
export default function NotFound() {
  const { t } = useI18n();
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p role="status" className="animate-pop rounded-2xl glass-strong px-4 py-3 text-sm">
        {t('mascot.notFound')}
      </p>
      <MascotStage pose="confused" size={[300, 232]} narrowSize={[240, 186]} label={t('mascot.name')} />
      <h1 className="display text-4xl">{t('common.notFoundTitle')}</h1>
      <p className="max-w-md text-muted">{t('common.notFoundText')}</p>
      <Link href="/drive" className="btn-primary rounded-full px-5 py-2.5 text-sm font-medium">
        {t('common.toDrive')}
      </Link>
    </main>
  );
}
