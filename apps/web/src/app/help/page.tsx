'use client';

import { PublicPage } from '@/components/public';
import { useI18n } from '@/i18n';

export default function HelpPage() {
  const { t } = useI18n();
  const faq = [
    [t('landing.q1'), t('landing.a1')],
    [t('landing.q2'), t('landing.a2')],
    [t('landing.q3'), t('landing.a3')],
    [t('upload.title'), t('upload.resumeHint')],
    [t('player.quality'), t('player.hotkeys')],
  ];
  return (
    <PublicPage>
      <section className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="text-3xl font-semibold">{t('help.title')}</h1>
        <div className="mt-6 divide-y divide-border rounded-2xl glass">
          {faq.map(([q, a]) => (
            <details key={q} className="p-5">
              <summary className="cursor-pointer font-medium">{q}</summary>
              <p className="mt-3 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted">{t('help.support')}</p>
      </section>
    </PublicPage>
  );
}
