'use client';

import clsx from 'clsx';
import { CircleCheck } from 'lucide-react';
import { useI18n } from '@/i18n';
import { CtaLink } from './public';
import { useSession } from './providers';

/**
 * Тарифная сетка (ТЗ §16). Цены задаёт заказчик; кнопок оплаты без работающей оплаты нет.
 * Карточки равноправны: огнём загорается та, на которую навели курсор или перешли с клавиатуры.
 */
export function PricingGrid() {
  const { t, locale } = useI18n();
  const { me } = useSession();
  const current = me?.plan?.code;
  const gb = locale === 'en' ? 'GB' : 'ГБ';
  const tb = locale === 'en' ? 'TB' : 'ТБ';
  const plans = [
    { code: 'FREE', name: 'Free', space: `10 ${gb}`, file: `5 ${gb}`, video: '1080p', sharing: t('pricing.sharingFree'), price: '0' },
    { code: 'PRO', name: 'Pro', space: `1 ${tb}`, file: `50 ${gb}`, video: '4K, HDR', sharing: t('pricing.sharingPro'), price: null },
    { code: 'PRO_MAX', name: 'Pro Max', space: `5 ${tb}`, file: `50 ${gb}`, video: '4K, HDR', sharing: t('pricing.sharingProMax'), price: null },
    { code: 'BUSINESS', name: 'Business', space: `10+ ${tb}`, file: `50 ${gb} (100 ${gb})`, video: '4K, HDR', sharing: t('pricing.sharingBusiness'), price: null },
  ];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => (
          <div
            key={p.code}
            className={clsx(
              'card-noir group relative flex h-full flex-col overflow-hidden rounded-3xl transition-[transform,box-shadow,border-color] duration-300',
              'hover:-translate-y-1 hover:border-[rgba(255,120,80,0.55)] hover:shadow-[0_28px_70px_-28px_rgba(230,30,50,0.85)]',
              'focus-within:-translate-y-1 focus-within:border-[rgba(255,120,80,0.55)] focus-within:shadow-[0_28px_70px_-28px_rgba(230,30,50,0.85)]',
            )}
          >
            {/* Огненная шапка проявляется при наведении; текст на ней всегда белый */}
            <div className="relative px-6 pb-5 pt-6">
              <div
                className="absolute inset-0 bg-[linear-gradient(160deg,#ff6a1a_0%,#e61e32_55%,#7a0c18_100%)] opacity-0 transition-opacity duration-300 group-focus-within:opacity-100 group-hover:opacity-100"
                aria-hidden
              />
              <div className="relative transition-colors duration-300 group-focus-within:text-white group-hover:text-white">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xl font-medium tracking-tight">{p.name}</h3>
                  {current === p.code && <span className="rounded-full border border-current px-2.5 py-0.5 text-[11px] font-medium opacity-80">{t('pricing.current')}</span>}
                </div>
                <p className="display mt-4 text-5xl">{p.space}</p>
                <p className="mt-2 text-sm text-muted transition-colors duration-300 group-focus-within:text-white/85 group-hover:text-white/85">
                  {p.price !== null ? `${p.price} ${t('pricing.perMonth')}` : t('pricing.priceTbd')}
                </p>
              </div>
            </div>
            <div className="flex flex-1 flex-col border-t border-border px-6 pb-6 pt-5">
              <ul className="flex flex-1 flex-col gap-2.5 text-sm">
                {[t('pricing.maxFile', { size: p.file }), t('pricing.video', { q: p.video }), p.sharing].map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-subtle transition-colors group-hover:text-accent" />
                    {x}
                  </li>
                ))}
              </ul>
              {p.code === 'FREE' && !me?.user && (
                <CtaLink href="/signup" className="mt-6 w-full">
                  {t('pricing.start')}
                </CtaLink>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-subtle">{t('pricing.soon')}</p>
    </>
  );
}
