'use client';

import { useI18n } from '@/i18n';
import { PublicPage } from './public';

/** Правовые страницы. Окончательный текст утверждает юрист заказчика (ТЗ §10.2). */
export function LegalPage({ kind }: { kind: 'terms' | 'privacy' | 'offer' }) {
  const { t } = useI18n();
  const points: Record<typeof kind, string[]> = {
    privacy: [
      'База данных и файлы хранятся во Франкфурте (Германия).',
      'Согласие на обработку персональных данных даётся при регистрации и фиксируется с датой.',
      'Файлы пользователей не передаются в сторонние сервисы анализа.',
      'Координаты съёмки и серийные номера камер из метаданных видны только владельцу файла.',
      'Доступ сотрудников к содержимому — только по утверждённому регламенту и с записью в журнал действий.',
      'Пользователь может удалить аккаунт со всеми данными.',
    ],
    terms: [
      'Оригиналы хранятся побайтово без изменений; для просмотра создаются отдельные версии.',
      'Удалённые файлы хранятся в корзине 30 дней, затем удаляются окончательно.',
      'Файлы, не прошедшие проверку безопасности, не выдаются как безопасные.',
      'Запрещено размещать вредоносные программы и материалы, нарушающие законодательство РК.',
    ],
    offer: ['Тарифы, цены и порядок оплаты определяются заказчиком и будут опубликованы до запуска платных тарифов.'],
  };
  const titles = { terms: t('legal.terms'), privacy: t('legal.privacy'), offer: t('legal.offer') };
  return (
    <PublicPage>
      <article className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="text-3xl font-semibold">{titles[kind]}</h1>
        <p className="mt-4 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">{t('legal.draft')}</p>
        <ul className="mt-6 list-disc space-y-3 pl-5 text-muted">
          {points[kind].map((p) => (
            <li key={p} lang="ru">
              {p}
            </li>
          ))}
        </ul>
      </article>
    </PublicPage>
  );
}
