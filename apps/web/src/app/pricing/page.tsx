'use client';

import { PricingGrid } from '@/components/pricing-grid';
import { PublicPage } from '@/components/public';
import { useI18n } from '@/i18n';

export default function PricingPage() {
  const { t } = useI18n();
  return (
    <PublicPage>
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h1 className="text-3xl font-semibold">{t('pricing.title')}</h1>
        <p className="mt-2 text-muted">{t('pricing.subtitle')}</p>
        <div className="mt-8">
          <PricingGrid />
        </div>
      </section>
    </PublicPage>
  );
}
