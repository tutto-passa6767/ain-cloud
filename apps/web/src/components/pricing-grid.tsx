'use client';

import clsx from 'clsx';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/i18n';
import { useSession } from './providers';

/** Тарифная сетка (ТЗ §16). Цены задаёт заказчик; кнопок оплаты без работающей оплаты нет. */
export function PricingGrid() {
  const { t, locale } = useI18n();
  const { me } = useSession();
  const current = me?.plan?.code;
  const gb = locale === 'en' ? 'GB' : 'ГБ';
  const tb = locale === 'en' ? 'TB' : 'ТБ';
  const plans = [
    { code: 'FREE', name: 'Free', space: `10 ${gb}`, file: `5 ${gb}`, video: '1080p', sharing: t('pricing.sharingFree'), price: '0' },
    { code: 'PRO', name: 'Pro', space: `1 ${tb}`, file: `50 ${gb}`, video: '4K, HDR', sharing: t('pricing.sharingPro'), price: null, featured: true },
    { code: 'PRO_MAX', name: 'Pro Max', space: `5 ${tb}`, file: `50 ${gb}`, video: '4K, HDR', sharing: t('pricing.sharingProMax'), price: null },
    { code: 'BUSINESS', name: 'Business', space: `10+ ${tb}`, file: `50 ${gb} (100 ${gb})`, video: '4K, HDR', sharing: t('pricing.sharingBusiness'), price: null },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {plans.map((p) => (
        <div key={p.code} className={clsx('glass spotlight flex flex-col rounded-2xl p-5', current === p.code || (!current && p.featured) ? 'border-accent' : 'border-border')}>
          <h3 className="text-lg font-semibold">{p.name}</h3>
          <p className="mt-2 text-2xl font-semibold">
            {p.price !== null ? `${p.price} ${t('pricing.perMonth')}` : <span className="text-base font-medium text-muted">{t('pricing.priceTbd')}</span>}
          </p>
          <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm">
            {[`${t('pricing.space')}: ${p.space}`, t('pricing.maxFile', { size: p.file }), t('pricing.video', { q: p.video }), p.sharing].map((x) => (
              <li key={x} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                {x}
              </li>
            ))}
          </ul>
          <div className="mt-5">
            {current === p.code ? (
              <span className="block rounded-lg bg-accent-soft px-3 py-2 text-center text-sm font-medium text-accent">{t('pricing.current')}</span>
            ) : p.code === 'FREE' && !me?.user ? (
              <Link href="/signup" className="block rounded-lg bg-accent px-3 py-2 text-center text-sm font-medium text-accent-fg hover:bg-accent-strong">
                {t('pricing.start')}
              </Link>
            ) : p.code !== 'FREE' ? (
              <p className="text-center text-xs text-muted">{t('pricing.soon')}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
