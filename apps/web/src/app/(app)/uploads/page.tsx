'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Badge, Spinner } from '@/components/ui';
import { UploadRow } from '@/components/upload-panel';
import { useI18n } from '@/i18n';
import { formatBytes, formatDate } from '@/lib/format';
import { useUploads } from '@/lib/uploader/react';

interface RecentSession {
  id: string;
  fileName: string;
  size: number;
  status: 'COMPLETED' | 'ABORTED' | 'EXPIRED' | 'FAILED';
  error: string | null;
  updatedAt?: string;
  completedAt: string | null;
  createdAt: string;
  asset?: { id: string; state: string; processing: string; deletedAt: string | null; name: string };
}

/** Активные, прерванные, завершённые и ошибочные загрузки (ТЗ §5) */
export default function UploadsPage() {
  const { t, tx, locale, intl } = useI18n();
  const items = useUploads();
  const { data } = useSWR<{ active: unknown[]; recent: RecentSession[] }>('/uploads', { refreshInterval: 10_000 });
  const live = items.filter((i) => i.status !== 'needs-file');
  const interrupted = items.filter((i) => i.status === 'needs-file');

  const statusTone = (s: RecentSession['status']) => (s === 'COMPLETED' ? 'success' : s === 'FAILED' ? 'danger' : 'neutral');
  const statusText = (s: RecentSession) =>
    s.status === 'COMPLETED' ? t('upload.done') : s.status === 'FAILED' ? `${t('upload.error')}${s.error ? `: ${tx(`errors.${s.error}`).replace(/^errors\./, '')}` : ''}` : t('upload.canceled');

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-3 py-4 sm:px-6">
      <h1 className="text-lg font-semibold">{t('upload.title')}</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">{t('upload.active')}</h2>
        {live.length ? (
          <ul className="flex flex-col gap-2">{live.map((i) => <UploadRow key={i.key} item={i} />)}</ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">{t('upload.noUploads')}</p>
        )}
      </section>

      {interrupted.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-muted">{t('upload.interrupted')}</h2>
          <p className="mb-2 text-xs text-muted">{t('upload.resumeHint')}</p>
          <ul className="flex flex-col gap-2">
            {interrupted.map((i) => (
              <div key={i.key}>
                <UploadRow item={i} />
                {i.expiresAt && <p className="mt-1 px-1 text-xs text-subtle">{t('upload.expires', { date: formatDate(i.expiresAt, intl, true) })}</p>}
              </div>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">{t('upload.history')}</h2>
        {!data ? (
          <Spinner />
        ) : data.recent.length === 0 ? (
          <p className="text-sm text-muted">—</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {data.recent.map((s) => (
              <li key={s.id} className="flex items-center gap-3 bg-surface px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  {s.status === 'COMPLETED' && s.asset && !s.asset.deletedAt ? (
                    <Link href={`/drive/file/${s.asset.id}`} className="block truncate font-medium hover:text-accent" title={s.fileName}>
                      {s.fileName}
                    </Link>
                  ) : (
                    <span className="block truncate" title={s.fileName}>
                      {s.fileName}
                    </span>
                  )}
                  <span className="text-xs text-muted">
                    {formatBytes(s.size, locale)} · {formatDate(s.completedAt ?? s.createdAt, intl, true)}
                  </span>
                </div>
                {s.asset && s.status === 'COMPLETED' && s.asset.state !== 'VERIFIED' && <Badge tone={s.asset.state === 'BLOCKED' ? 'danger' : 'accent'}>{tx(`state.${s.asset.state}`)}</Badge>}
                <Badge tone={statusTone(s.status)}>{statusText(s)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
